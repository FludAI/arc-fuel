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
    ///         the relayer; cannot exceed MINT_CAP.
    address public admin;

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
}
