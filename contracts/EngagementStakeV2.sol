// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// (c) 2026 FludAI / viability.news. Code licensed MIT (SPDX above).
// Patents pending. No patent rights are granted by this license.

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/// @title EngagementStakeV2 — the wNEWS stake leg, on Base, many supporters per engagement
/// @notice Supporters (LLPs) stake wNEWS into a named engagement. The stake is a
///         market-linked structured-capital leg — not equity, not a payment.
///         It is returned at settlement (less the declared at-risk share on an
///         attested failure) or, if nobody settles, by the supporter's own exit
///         after their lock. A premium may be funded against the engagement by
///         any number of funders and is shared pro-rata among the supporters
///         still staked at settlement on an admin-attested success; on failure
///         each funder takes their own premium back.
///
///         What changed from v1 (0x3Dc8CB2e7fECAfE4302c1777a6C2a1c996aC5169):
///         - positions are keyed by (engagementId, staker): several supporters
///           can stake into one engagement, and nobody can squat an id;
///         - settlement is pull-based: `settle` records the outcome, each
///           supporter `claim`s, each funder `refundPremium`s — no loops;
///         - premium accounting is per funder (v1 credited the first funder);
///         - the operator's auto-approve is bounded by BOTH the staker's
///           per-ask `cap` and the staker's `maxAutoLock`;
///         - the at-risk share of the stake on failure is a constructor
///           parameter (`atRiskBps`), so the declared rule is encoded at
///           deployment. 0 = stake never at risk (v1 behaviour).
///
///         Discipline mirrors v1 and BaseLocker: immutable hardware admin,
///         pause stops NEW stakes and NEW premium only and NEVER blocks exit,
///         claim, refund or settlement, no upgradeability, state before transfer.
contract EngagementStakeV2 {
    IERC20 public immutable wnews;

    /// @notice Hardware-backed. Attests settlements, rotates the operator,
    ///         pauses new inflows. Cannot touch stakes.
    address public immutable admin;

    /// @notice Receives the at-risk share on an attested failure.
    address public immutable treasury;

    /// @notice Share of a stake forfeited on an attested failure, in basis
    ///         points of the stake. Declared at deployment. 0 = never at risk.
    uint16 public immutable atRiskBps;

    /// @notice Data-plane key allowed to `stakeFor` within each staker's own
    ///         cap and max lock. Rotatable by admin.
    address public operator;

    /// @notice Longest lock any stake may carry.
    uint64 public constant MAX_LOCK = 730 days;

    /// @notice Longest lock the operator may set for a staker who set a cap
    ///         but never set `maxAutoLock`. Deliberately short.
    uint64 public constant DEFAULT_AUTO_LOCK = 90 days;

    struct Engagement {
        uint256 totalStaked;    // sum of open positions
        uint256 premiumTotal;   // sum of premiumOf
        bool closed;
        bool success;
        uint256 settledStake;   // totalStaked at settlement — the premium denominator
        uint256 settledPremium; // premiumTotal at settlement — the premium numerator
    }

    struct Position {
        uint256 amount;
        uint64 fundedUntil;
        bool claimed;
    }

    mapping(bytes32 => Engagement) public engagements;
    mapping(bytes32 => mapping(address => Position)) public positions;
    mapping(bytes32 => mapping(address => uint256)) public premiumOf;

    /// @notice Per-ask ceiling the staker allows the operator to draw without
    ///         asking. Set only by the staker. 0 (default) = always ask.
    mapping(address => uint256) public cap;

    /// @notice Longest lock the staker allows the operator to set without
    ///         asking. 0 (default) = DEFAULT_AUTO_LOCK.
    mapping(address => uint64) public maxAutoLock;

    bool public paused;

    event Staked(bytes32 indexed engagementId, address indexed staker, uint256 amount, uint64 fundedUntil, bool byOperator);
    event CapSet(address indexed staker, uint256 cap);
    event MaxAutoLockSet(address indexed staker, uint64 maxAutoLock);
    event PremiumFunded(bytes32 indexed engagementId, address indexed from, uint256 amount);
    event Settled(bytes32 indexed engagementId, bool success, uint256 settledStake, uint256 settledPremium);
    event Claimed(bytes32 indexed engagementId, address indexed staker, uint256 stakeReturned, uint256 premiumPaid, uint256 forfeited);
    event PremiumRefunded(bytes32 indexed engagementId, address indexed funder, uint256 amount);
    event Exited(bytes32 indexed engagementId, address indexed staker, uint256 amount);
    event OperatorSet(address indexed operator);
    event PausedSet(bool paused);

    error NotAdmin();
    error NotOperator();
    error Paused();
    error ZeroAmount();
    error LockTooLong(uint64 wanted, uint64 max);
    error NoStake(bytes32 engagementId);
    error NothingToClaim(bytes32 engagementId);
    error NothingToRefund(bytes32 engagementId);
    error Closed(bytes32 engagementId);
    error NotClosed(bytes32 engagementId);
    error OverCap(uint256 wanted, uint256 cap);
    error StillLocked(uint64 fundedUntil);

    constructor(address _wnews, address _admin, address _treasury, address _operator, uint16 _atRiskBps) {
        require(_wnews != address(0) && _admin != address(0) && _treasury != address(0) && _operator != address(0), "zero addr");
        require(_atRiskBps <= 10_000, "bps > 100%");
        wnews = IERC20(_wnews);
        admin = _admin;
        treasury = _treasury;
        operator = _operator;
        atRiskBps = _atRiskBps;
    }

    // ---- Staker ----

    /// @notice Stake your own wNEWS into an engagement. Same signature as v1:
    ///         the consent screen decodes (engagementId, amount, lockSeconds).
    ///         A second stake into the same engagement tops the position up
    ///         and extends its lock to the later date. Requires prior approval.
    function stake(bytes32 engagementId, uint256 amount, uint64 lockSeconds) external {
        _stake(engagementId, msg.sender, amount, lockSeconds, false);
    }

    /// @notice Per-ask amount the operator may stake for you without asking.
    function setCap(uint256 c) external {
        cap[msg.sender] = c;
        emit CapSet(msg.sender, c);
    }

    /// @notice Longest lock the operator may set for you without asking.
    function setMaxAutoLock(uint64 l) external {
        if (l > MAX_LOCK) revert LockTooLong(l, MAX_LOCK);
        maxAutoLock[msg.sender] = l;
        emit MaxAutoLockSet(msg.sender, l);
    }

    /// @notice Take your stake back after your lock if nobody settled.
    ///         NOT pausable, NOT admin-gated. Leaving before settlement also
    ///         leaves the premium: only positions open at settlement share it.
    function exit(bytes32 engagementId) external {
        Engagement storage e = engagements[engagementId];
        Position storage p = positions[engagementId][msg.sender];
        if (p.amount == 0) revert NoStake(engagementId);
        if (e.closed) revert Closed(engagementId);
        if (block.timestamp < p.fundedUntil) revert StillLocked(p.fundedUntil);
        uint256 amount = p.amount;
        p.amount = 0;
        p.fundedUntil = 0;
        e.totalStaked -= amount;
        emit Exited(engagementId, msg.sender, amount);
        require(wnews.transfer(msg.sender, amount), "transfer failed");
    }

    /// @notice After settlement: your stake back (less the at-risk share on
    ///         failure) plus your pro-rata share of the premium on success.
    ///         NOT pausable, NOT admin-gated.
    function claim(bytes32 engagementId) external {
        Engagement storage e = engagements[engagementId];
        Position storage p = positions[engagementId][msg.sender];
        if (!e.closed) revert NotClosed(engagementId);
        if (p.amount == 0 || p.claimed) revert NothingToClaim(engagementId);
        p.claimed = true;
        uint256 amount = p.amount;
        uint256 forfeited = e.success ? 0 : (amount * atRiskBps) / 10_000;
        uint256 premium = (e.success && e.settledStake > 0) ? (e.settledPremium * amount) / e.settledStake : 0;
        uint256 returned = amount - forfeited;
        emit Claimed(engagementId, msg.sender, returned, premium, forfeited);
        require(wnews.transfer(msg.sender, returned + premium), "transfer failed");
        if (forfeited > 0) require(wnews.transfer(treasury, forfeited), "transfer failed");
    }

    // ---- Operator (bounded by the staker's own cap and max lock) ----

    /// @notice Stake on a staker's behalf, at or under their cap and max
    ///         lock, from their allowance. Emits byOperator=true so the
    ///         record shows the human did not sign this one.
    function stakeFor(address staker, bytes32 engagementId, uint256 amount, uint64 lockSeconds) external {
        if (msg.sender != operator) revert NotOperator();
        uint256 c = cap[staker];
        if (amount > c) revert OverCap(amount, c);
        uint64 ml = maxAutoLock[staker];
        if (ml == 0) ml = DEFAULT_AUTO_LOCK;
        if (lockSeconds > ml) revert LockTooLong(lockSeconds, ml);
        _stake(engagementId, staker, amount, lockSeconds, true);
    }

    // ---- Anyone ----

    /// @notice Fund the success premium. Shared pro-rata by the supporters
    ///         staked at settlement on success; returned to you otherwise.
    function fundPremium(bytes32 engagementId, uint256 amount) external {
        if (paused) revert Paused();
        if (amount == 0) revert ZeroAmount();
        Engagement storage e = engagements[engagementId];
        if (e.closed) revert Closed(engagementId);
        premiumOf[engagementId][msg.sender] += amount;
        e.premiumTotal += amount;
        emit PremiumFunded(engagementId, msg.sender, amount);
        require(wnews.transferFrom(msg.sender, address(this), amount), "transfer failed");
    }

    /// @notice After settlement, a funder takes their premium back if the
    ///         engagement failed or nobody was staked to receive it.
    ///         NOT pausable, NOT admin-gated.
    function refundPremium(bytes32 engagementId) external {
        Engagement storage e = engagements[engagementId];
        if (!e.closed) revert NotClosed(engagementId);
        if (e.success && e.settledStake > 0) revert NothingToRefund(engagementId);
        uint256 amount = premiumOf[engagementId][msg.sender];
        if (amount == 0) revert NothingToRefund(engagementId);
        premiumOf[engagementId][msg.sender] = 0;
        emit PremiumRefunded(engagementId, msg.sender, amount);
        require(wnews.transfer(msg.sender, amount), "transfer failed");
    }

    // ---- Admin (bounded) ----

    /// @notice Attest the outcome. Records it and snapshots the premium
    ///         denominator; moves no tokens. Supporters `claim`, funders
    ///         `refundPremium`. NOT pausable: settlement can always land.
    function settle(bytes32 engagementId, bool success) external {
        if (msg.sender != admin) revert NotAdmin();
        Engagement storage e = engagements[engagementId];
        if (e.closed) revert Closed(engagementId);
        if (e.totalStaked == 0 && e.premiumTotal == 0) revert NoStake(engagementId);
        e.closed = true;
        e.success = success;
        e.settledStake = e.totalStaked;
        e.settledPremium = e.premiumTotal;
        emit Settled(engagementId, success, e.settledStake, e.settledPremium);
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

    // ---- Views ----

    /// @notice What a supporter would receive from `claim` right now (0 if not settled).
    function claimable(bytes32 engagementId, address staker) external view returns (uint256 stakeReturned, uint256 premium) {
        Engagement storage e = engagements[engagementId];
        Position storage p = positions[engagementId][staker];
        if (!e.closed || p.amount == 0 || p.claimed) return (0, 0);
        uint256 forfeited = e.success ? 0 : (p.amount * atRiskBps) / 10_000;
        premium = (e.success && e.settledStake > 0) ? (e.settledPremium * p.amount) / e.settledStake : 0;
        stakeReturned = p.amount - forfeited;
    }

    // ---- internal ----

    function _stake(bytes32 engagementId, address staker, uint256 amount, uint64 lockSeconds, bool byOperator) internal {
        if (paused) revert Paused();
        if (amount == 0) revert ZeroAmount();
        if (lockSeconds > MAX_LOCK) revert LockTooLong(lockSeconds, MAX_LOCK);
        Engagement storage e = engagements[engagementId];
        if (e.closed) revert Closed(engagementId);
        Position storage p = positions[engagementId][staker];
        uint64 until = uint64(block.timestamp) + lockSeconds;
        if (until < p.fundedUntil) until = p.fundedUntil; // top-up never shortens a lock
        p.amount += amount;
        p.fundedUntil = until;
        e.totalStaked += amount;
        emit Staked(engagementId, staker, amount, until, byOperator);
        require(wnews.transferFrom(staker, address(this), amount), "transfer failed");
    }
}
