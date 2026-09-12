// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// (c) 2026 FludAI / viability.news. Code licensed MIT (SPDX above).
// Patents pending. No patent rights are granted by this license.

/// @title TestWNEWS — TESTNET ONLY stand-in for wNEWS on Base Sepolia
/// @notice Anyone can mint. Exists so EngagementStake can be exercised
///         end-to-end (approve → stake → exit/settle) on Sepolia before
///         it is pointed at the canonical wNEWS on Base. Never deploy
///         to mainnet; never confuse with 0xEd14…76bA.
contract TestWNEWS {
    string public constant name = "Test wNEWS (Sepolia)";
    string public constant symbol = "tWNEWS";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
