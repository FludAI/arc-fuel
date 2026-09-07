// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WNewsBridge — Arc-side wNEWS: lock-on-Base / mint-on-Arc
/// @notice Deliberately minimal mainnet bridge. The worst case is priced,
///         not wished away: a hard mint cap bounds total exposure, the
///         contract is pausable, and admin lives on a hardware-backed
///         key. Mint authority on Arc equals inflation authority — this
///         contract is a crown-jewel key and is sized accordingly.
/// @dev    The Arc-side token is this contract itself (minimal ERC20):
///         fewer moving parts than token + bridge, and the supply here
///         IS the bridged float by construction.
contract WNewsBridge {
    // ---- ERC20 (minimal, name-first so reviewers see what this is) ----
    string public constant name = "Wrapped NEWS (Arc, bridged)";
    string public constant symbol = "wNEWS.arc";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ---- Bridge policy ----
    /// @notice Hard ceiling on Arc-side supply — the blast radius.
    ///         ~100K wNEWS: low four figures USD at canonical price.
    uint256 public constant MINT_CAP = 100_000e18;

    /// @notice Hardware-backed admin (Safe-bound). Can pause and rotate
    ///         the relayer; cannot exceed MINT_CAP. Immutable: admin
    ///         rotation means redeploying — this contract is small and
    ///         capped enough that redeploy beats a writable admin slot.
    address public immutable admin;

    /// @notice Key that attests Base-side lock events. Data-plane role:
    ///         it can mint only up to the cap, never touch the cap.
    address public relayer;

    bool public paused;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotAdmin();
    error NotRelayer();
    error Paused();
    error CapExceeded(uint256 wanted, uint256 room);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(address _admin, address _relayer) {
        require(_admin != address(0) && _relayer != address(0), "zero addr");
        admin = _admin;
        relayer = _relayer;
    }

    // ---- Bridge mechanics ----

    /// @notice Emitted on mint; `baseLockTx` ties every Arc token to a
    ///         specific Base-side lock. Float accounting reads this.
    event BridgedIn(address indexed to, uint256 amount, bytes32 indexed baseLockTx);

    /// @notice Emitted on burn; the Base-side unlocker watches for it.
    event BridgedOut(address indexed from, uint256 amount, address baseRecipient);

    error AlreadyProcessed(bytes32 baseLockTx);

    /// @notice Each Base lock event mints exactly once.
    mapping(bytes32 => bool) public processed;

    /// @notice Mint against an attested Base-side lock. Relayer-only,
    ///         idempotent per lock tx, capped in total.
    function bridgeIn(address to, uint256 amount, bytes32 baseLockTx)
        external
        whenNotPaused
    {
        if (msg.sender != relayer) revert NotRelayer();
        if (processed[baseLockTx]) revert AlreadyProcessed(baseLockTx);
        if (totalSupply + amount > MINT_CAP) {
            revert CapExceeded(amount, MINT_CAP - totalSupply);
        }
        processed[baseLockTx] = true;
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        emit BridgedIn(to, amount, baseLockTx);
    }

    /// @notice Burn Arc-side wNEWS to unlock on Base. Works even when
    ///         paused — pause stops inflows, never exits.
    function bridgeOut(uint256 amount, address baseRecipient) external {
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
        emit BridgedOut(msg.sender, amount, baseRecipient);
    }

    // ---- Admin (bounded) ----

    function setPaused(bool p) external onlyAdmin {
        paused = p;
    }

    function setRelayer(address r) external onlyAdmin {
        require(r != address(0), "zero addr");
        relayer = r;
    }

    // ---- ERC20 transfer surface ----

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
