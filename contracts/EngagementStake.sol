// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// (c) 2026 FludAI / viability.news. Code licensed MIT (SPDX above).
// Patents pending. No patent rights are granted by this license.

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @title EngagementStake — the wNEWS stake leg, on Base, one signature
/// @notice An LLP stakes wNEWS into a named engagement. The stake is a
///         market-linked structured-capital leg, not
///         equity and not a payment: it is returned to the staker at
///         settlement or, if nobody settles, by the staker's own exit
///         after `fundedUntil`. A premium may be funded against the
///         engagement and is paid to the staker on an admin-attested
///         success.
///
///         Discipline mirrors BaseLocker: immutable hardware admin,
///         pause stops NEW stakes only and NEVER blocks exit or
///         settlement, no upgradeability, state before transfer.
///
///         Auto-approve under cap (LLP setting): the staker sets an
///         on-chain per-ask `cap`; the operator may `stakeFor` that
///         staker only at or under it, drawing on the staker's own
///         ERC-20 allowance to this contract. Cap 0 (default) = always
///         ask, i.e. only the staker's own `stake` works.
///
/// @dev    Not yet specified: whether the stake is at risk on failure.
///         v1 returns
///         the stake in full in every path; the premium is the only
///         outcome-contingent amount. Slashing is a later, declared
///         change, which — this contract being immutable — means a new
///         deployment, on purpose.
contract EngagementStake {
    IERC20 public immutable wnews;

    /// @notice Hardware-backed. Attests settlements, rotates the
    ///         operator, pauses new stakes. Cannot touch stakes.
    address public immutable admin;

    /// @notice Where an unpaid premium returns on failure or exit.
    address public immutable treasury;

    /// @notice Data-plane key allowed to `stakeFor` within each
    ///         staker's own cap. Rotatable by admin.
    address public operator;

    /// @notice Longest lock a stake may carry.
    uint64 public constant MAX_LOCK = 730 days;

    struct Engagement {
        address staker;
        uint256 amount;
        uint64 fundedUntil;
        address premiumFunder;
        uint256 premium;
        bool closed;
    }

    mapping(bytes32 => Engagement) public engagements;

    /// @notice Per-ask ceiling the staker allows the operator to draw
    ///         without asking. Set only by the staker.
    mapping(address => uint256) public cap;

    bool public paused;

    event Staked(bytes32 indexed engagementId, address indexed staker, uint256 amount, uint64 fundedUntil, bool byOperator);
    event CapSet(address indexed staker, uint256 cap);
    event PremiumFunded(bytes32 indexed engagementId, address indexed from, uint256 amount);
    event Settled(bytes32 indexed engagementId, address indexed staker, bool success, uint256 stakeReturned, uint256 premiumPaid);
    event Exited(bytes32 indexed engagementId, address indexed staker, uint256 amount);
    event OperatorSet(address indexed operator);
    event PausedSet(bool paused);

    error NotAdmin();
    error NotOperator();
    error NotStaker();
    error Paused();
    error ZeroAmount();
    error LockTooLong(uint64 wanted, uint64 max);
    error AlreadyStaked(bytes32 engagementId);
    error NoStake(bytes32 engagementId);
    error Closed(bytes32 engagementId);
    error OverCap(uint256 wanted, uint256 cap);
    error StillLocked(uint64 fundedUntil);

    constructor(address _wnews, address _admin, address _treasury, address _operator) {
        require(_wnews != address(0) && _admin != address(0) && _treasury != address(0) && _operator != address(0), "zero addr");
        wnews = IERC20(_wnews);
        admin = _admin;
        treasury = _treasury;
        operator = _operator;
    }

    // ---- Staker ----

    /// @notice Stake your own wNEWS into an engagement. This is what the
    ///         consent screen decodes and shows: (engagementId, amount,
    ///         lockSeconds). Requires prior ERC-20 approval.
    function stake(bytes32 engagementId, uint256 amount, uint64 lockSeconds) external {
        _stake(engagementId, msg.sender, amount, lockSeconds, false);
    }

    /// @notice Set the per-ask amount the operator may stake for you
    ///         without asking. 0 = always ask.
    function setCap(uint256 c) external {
        cap[msg.sender] = c;
        emit CapSet(msg.sender, c);
    }

    /// @notice Take your stake back after the lock if nobody settled.
    ///         Deliberately NOT pausable and NOT admin-gated: the
    ///         staker's exit is always available.
    function exit(bytes32 engagementId) external {
        Engagement storage e = engagements[engagementId];
        if (e.staker == address(0)) revert NoStake(engagementId);
        if (e.staker != msg.sender) revert NotStaker();
        if (e.closed) revert Closed(engagementId);
        if (block.timestamp < e.fundedUntil) revert StillLocked(e.fundedUntil);
        e.closed = true;
        uint256 amount = e.amount;
        uint256 premium = e.premium;
        address funder = e.premiumFunder;
        emit Exited(engagementId, msg.sender, amount);
        require(wnews.transfer(msg.sender, amount), "transfer failed");
        if (premium > 0) {
            require(wnews.transfer(funder == address(0) ? treasury : funder, premium), "transfer failed");
        }
    }

    // ---- Operator (bounded by the staker's own cap) ----

    /// @notice Stake on a staker's behalf, at or under their cap, from
    ///         their allowance. Emits byOperator=true so the record
    ///         shows the human did not sign this one.
    function stakeFor(address staker, bytes32 engagementId, uint256 amount, uint64 lockSeconds) external {
        if (msg.sender != operator) revert NotOperator();
        uint256 c = cap[staker];
        if (amount > c) revert OverCap(amount, c);
        _stake(engagementId, staker, amount, lockSeconds, true);
    }

    // ---- Anyone ----

    /// @notice Fund the success premium for an engagement. Paid to the
    ///         staker on success, returned to the funder otherwise.
    function fundPremium(bytes32 engagementId, uint256 amount) external {
        Engagement storage e = engagements[engagementId];
        if (e.staker == address(0)) revert NoStake(engagementId);
        if (e.closed) revert Closed(engagementId);
        if (amount == 0) revert ZeroAmount();
        if (e.premiumFunder == address(0)) e.premiumFunder = msg.sender;
        e.premium += amount;
        emit PremiumFunded(engagementId, msg.sender, amount);
        require(wnews.transferFrom(msg.sender, address(this), amount), "transfer failed");
    }

    // ---- Admin (bounded) ----

    /// @notice Attest the outcome. Stake always returns to the staker;
    ///         premium goes to the staker on success, else back to the
    ///         funder. NOT pausable: settlement can always land.
    function settle(bytes32 engagementId, bool success) external {
        if (msg.sender != admin) revert NotAdmin();
        Engagement storage e = engagements[engagementId];
        if (e.staker == address(0)) revert NoStake(engagementId);
        if (e.closed) revert Closed(engagementId);
        e.closed = true;
        address staker = e.staker;
        uint256 amount = e.amount;
        uint256 premium = e.premium;
        address funder = e.premiumFunder == address(0) ? treasury : e.premiumFunder;
        uint256 premiumPaid = success ? premium : 0;
        emit Settled(engagementId, staker, success, amount, premiumPaid);
        require(wnews.transfer(staker, amount + premiumPaid), "transfer failed");
        if (!success && premium > 0) {
            require(wnews.transfer(funder, premium), "transfer failed");
        }
    }

    function setOperator(address o) external {
        if (msg.sender != admin) revert NotAdmin();
        require(o != address(0), "zero addr");
        operator = o;
        emit OperatorSet(o);
    }

    function setPaused(bool p) external {
        if (msg.sender != admin) revert NotAdmin();
        paused = p;
        emit PausedSet(p);
    }

    // ---- internal ----

    function _stake(bytes32 engagementId, address staker, uint256 amount, uint64 lockSeconds, bool byOperator) internal {
        if (paused) revert Paused();
        if (amount == 0) revert ZeroAmount();
        if (lockSeconds > MAX_LOCK) revert LockTooLong(lockSeconds, MAX_LOCK);
        Engagement storage e = engagements[engagementId];
        if (e.staker != address(0)) revert AlreadyStaked(engagementId);
        uint64 until = uint64(block.timestamp) + lockSeconds;
        e.staker = staker;
        e.amount = amount;
        e.fundedUntil = until;
        emit Staked(engagementId, staker, amount, until, byOperator);
        require(wnews.transferFrom(staker, address(this), amount), "transfer failed");
    }
}
