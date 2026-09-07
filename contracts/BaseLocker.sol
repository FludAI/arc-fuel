// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

/// @title BaseLocker — Base-side vault of the wNEWS ⇄ Arc bridge
/// @notice Users lock wNEWS here; the relayer mints the same amount on
///         Arc (WNewsBridge.bridgeIn). Burns on Arc (bridgeOut) are
///         released here. Mirrors the Arc side's discipline: hard cap,
///         pause stops lock-ins but NEVER releases, immutable admin,
///         data-plane relayer, one release per Arc burn tx.
contract BaseLocker {
    IERC20 public immutable wnews;

    /// @notice Mirror of WNewsBridge.MINT_CAP — the vault never holds
    ///         more than Arc can mint, so custody risk equals mint risk.
    uint256 public constant LOCK_CAP = 100_000e18;

    /// @notice Hardware-backed. Can pause lock-ins and rotate the
    ///         relayer; cannot raise the cap or touch locked funds.
    address public immutable admin;

    /// @notice Watches Arc BridgedOut events and releases here.
    address public relayer;

    uint256 public totalLocked;
    bool public paused;

    /// @notice One release per Arc-side burn transaction.
    mapping(bytes32 => bool) public released;

    /// @notice The relayer watches this to mint on Arc; the tx hash of
    ///         this event is the user's claim ticket.
    event Locked(address indexed sender, address indexed arcRecipient, uint256 amount);

    /// @notice Funds returned against a specific Arc burn.
    event Released(address indexed to, uint256 amount, bytes32 indexed arcBurnTx);

    error NotAdmin();
    error NotRelayer();
    error Paused();
    error CapExceeded(uint256 wanted, uint256 room);
    error AlreadyReleased(bytes32 arcBurnTx);

    constructor(address _wnews, address _admin, address _relayer) {
        require(_wnews != address(0) && _admin != address(0) && _relayer != address(0), "zero addr");
        wnews = IERC20(_wnews);
        admin = _admin;
        relayer = _relayer;
    }

    /// @notice Lock wNEWS; receive on Arc at your own address.
    function lock(uint256 amount) external {
        _lock(msg.sender, amount);
    }

    /// @notice Lock wNEWS; receive on Arc at a different address.
    function lockFor(address arcRecipient, uint256 amount) external {
        require(arcRecipient != address(0), "zero addr");
        _lock(arcRecipient, amount);
    }

    function _lock(address arcRecipient, uint256 amount) internal {
        if (paused) revert Paused();
        if (totalLocked + amount > LOCK_CAP) {
            revert CapExceeded(amount, LOCK_CAP - totalLocked);
        }
        totalLocked += amount;
        emit Locked(msg.sender, arcRecipient, amount);
        require(wnews.transferFrom(msg.sender, address(this), amount), "transfer failed");
    }

    /// @notice Release against an Arc-side burn. Relayer-only, idempotent
    ///         per burn tx, and deliberately NOT pausable — exits from
    ///         Arc can always land, mirroring bridgeOut on the Arc side.
    function release(address to, uint256 amount, bytes32 arcBurnTx) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (released[arcBurnTx]) revert AlreadyReleased(arcBurnTx);
        released[arcBurnTx] = true;
        totalLocked -= amount;
        emit Released(to, amount, arcBurnTx);
        require(wnews.transfer(to, amount), "transfer failed");
    }

    // ---- Admin (bounded) ----

    function setPaused(bool p) external {
        if (msg.sender != admin) revert NotAdmin();
        paused = p;
    }

    function setRelayer(address r) external {
        if (msg.sender != admin) revert NotAdmin();
        require(r != address(0), "zero addr");
        relayer = r;
    }
}
