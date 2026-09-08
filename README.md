# arc-fuel — wNEWS on Arc: capped bridge + attested price

ETHOnline 2026. Two deliberately minimal contracts bringing wNEWS
(canonical market: wNEWS/USDC Uniswap v3 on Base) to Arc mainnet.
All code written during the event window, committed granularly for
line-by-line review.

## Contracts

- **`contracts/WNewsBridge.sol`** — lock-on-Base / mint-on-Arc. The
  Arc-side token is the bridge contract itself, so Arc supply equals
  bridged float by construction. Hard mint cap (`MINT_CAP = 100_000e18`)
  bounds worst-case exposure; pausable (pause stops inflows, never
  redemptions — `bridgeOut` burns even when paused); admin and relayer
  are split roles, and admin cannot raise the cap. Mint is idempotent
  per Base-side lock transaction.
- **`contracts/BaseLocker.sol`** — Base-side vault. `lock(amount)` /
  `lockFor(arcRecipient, amount)`; `LOCK_CAP` mirrors the Arc mint cap,
  releases are relayer-attested against Arc burns, idempotent per burn
  tx, and never pausable — exits always land. Same admin/relayer role
  split as the bridge.
- **`contracts/AttestedPrice.sol`** — price consumer. There is
  intentionally no Arc-side AMM pool for wNEWS: a second market for the
  same asset would fork the price signal. Price arrives as signed prints
  from the canonical Base pool; the digest binds contract address and
  chain id (no replay), prints are monotonic in observation time, and
  `freshPrice()` reverts rather than serve a stale value. The signer is
  a data key, never a funds key.

## Build

```
npx solc --bin --optimize -o build contracts/AttestedPrice.sol contracts/WNewsBridge.sol contracts/BaseLocker.sol
```

No external dependencies — the full reviewable surface is these three
files.

## Live deployments

Arc is testnet-only today (per Circle's docs); the mainnet redeploy
happens the day Circle publishes mainnet parameters.

| Contract | Chain | Address |
|---|---|---|
| `WNewsBridge` | Arc Testnet (5042002) | [`0x96D213E6d0fc3925F557d50D0d49e2Cd90a44E57`](https://testnet.arcscan.app/address/0x96D213E6d0fc3925F557d50D0d49e2Cd90a44E57) |
| `AttestedPrice` | Arc Testnet (5042002) | [`0x64131A7Ef739e728fEae1F482D472F537446214e`](https://testnet.arcscan.app/address/0x64131A7Ef739e728fEae1F482D472F537446214e) |
| `BaseLocker` | Base (8453) | [`0x96D213E6d0fc3925F557d50D0d49e2Cd90a44E57`](https://basescan.org/address/0x96D213E6d0fc3925F557d50D0d49e2Cd90a44E57) |

Admin on all three: hardware-backed `0x9dc649Ac43e36805F0C0AAEa1a91aB014b95339c`
(Ledger; the deployer key held no post-deploy power). First attested
price print is live on Arc — `freshPrice()` returns the canonical Base
pool's print, signed and staleness-guarded.

## Notices

© 2026 FludAI / viability.news. Contract code is licensed MIT (see SPDX
headers). FUEL builds on patent-pending viability-grading technology
(U.S. patent applications filed) — the enabling grading/valuation system,
not this contract code; no patent rights are granted by the code license.

## Off-chain scripts (`scripts/`)

- `attester.mjs` — reads slot0 from the canonical Base pool, signs the
  price print (data key), posts to AttestedPrice on Arc. `--dry-run`
  works today against Base mainnet.
- `relayer.mjs` — Base `Locked` → Arc `bridgeIn`; Arc `BridgedOut` →
  Base `release`. Stateless by design: idempotency is enforced on-chain,
  so crash-and-replay is safe.

Both need only `ethers`; addresses/keys arrive via `.env` after deploy.
