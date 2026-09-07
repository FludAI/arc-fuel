// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AttestedPrice — Arc-side consumer of the canonical Base price
/// @notice There is deliberately NO Arc-side market for wNEWS. Price
///         arrives as signed attestations from the off-chain pipeline
///         that reads the canonical wNEWS/USDC Uniswap v3 pool on Base
///         (slot0 + TWAP). One signal, many venues.
/// @dev    The attestation signer is a data key, never a funds key.
contract AttestedPrice {
    /// @notice Address whose signatures are accepted for price prints.
    address public immutable signer;

    /// @notice Latest attested price of 1 wNEWS in USDC (6 decimals).
    uint256 public price;

    /// @notice Base-chain timestamp the pipeline observed for this print.
    uint64 public observedAt;

    /// @notice Prints older than this are rejected as stale.
    uint64 public constant MAX_AGE = 2 hours;

    event PricePosted(uint256 price, uint64 observedAt, address indexed poster);

    error StalePrint(uint64 observedAt, uint64 nowTs);
    error NotNewer(uint64 observedAt, uint64 current);
    error BadSignature();

    constructor(address _signer) {
        require(_signer != address(0), "signer=0");
        signer = _signer;
    }

    /// @notice Post a signed price print. Anyone may relay; only the
    ///         pipeline's signature makes it valid.
    /// @param newPrice   wNEWS/USDC price, 6 decimals.
    /// @param newObserved Base-side observation timestamp of the print.
    /// @param v,r,s      Signature by `signer` over the print digest.
    function post(uint256 newPrice, uint64 newObserved, uint8 v, bytes32 r, bytes32 s) external {
        if (newObserved + MAX_AGE < block.timestamp) {
            revert StalePrint(newObserved, uint64(block.timestamp));
        }
        if (newObserved <= observedAt) revert NotNewer(newObserved, observedAt);

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(address(this), block.chainid, newPrice, newObserved))
        ));
        if (ecrecover(digest, v, r, s) != signer) revert BadSignature();

        price = newPrice;
        observedAt = newObserved;
        emit PricePosted(newPrice, newObserved, msg.sender);
    }

    /// @notice Latest print, reverting when stale — consumers get a live
    ///         value or nothing, never a quietly old one.
    function freshPrice() external view returns (uint256) {
        if (observedAt + MAX_AGE < block.timestamp) {
            revert StalePrint(observedAt, uint64(block.timestamp));
        }
        return price;
    }
}
