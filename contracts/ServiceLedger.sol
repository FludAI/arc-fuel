// SPDX-License-Identifier: MIT
// © 2026 FludAI / viability.news — see repository README for notices.
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title ServiceLedger — attributed agent-to-agent payments on Arc
/// @notice A bare ERC-20 transfer says who and how much, never what for.
///         `payFor` moves wNEWS.arc between agents and stamps the payment
///         with a goalId — the company objective (coarse id, never a
///         mapping) the service furthers. The event stream is the
///         attributed flow graph: which agent paid which, for which goal.
/// @dev    Stateless by design: no balances, no admin, no pause — it is
///         a memo rail over the token. If the token reverts, nothing
///         happened. Analytics join ServicePaid to off-chain goal ids.
contract ServiceLedger {
    IERC20Minimal public immutable token;

    event ServicePaid(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed goalId
    );

    constructor(address _token) {
        require(_token != address(0), "token=0");
        token = IERC20Minimal(_token);
    }

    /// @notice Pay an agent for service toward a goal. Requires prior
    ///         ERC-20 approval of this contract by the payer.
    function payFor(address to, uint256 amount, bytes32 goalId) external {
        require(to != address(0), "to=0");
        emit ServicePaid(msg.sender, to, amount, goalId);
        require(token.transferFrom(msg.sender, to, amount), "transfer failed");
    }
}
