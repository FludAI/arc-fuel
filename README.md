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
files. Deployment addresses and the first bridged-token transaction will
be added here when live.

## Notices

© 2026 FludAI / viability.news. Contract code is licensed MIT (see SPDX
headers). FUEL builds on patent-pending viability-grading technology
(U.S. patent applications filed) — the enabling grading/valuation system,
not this contract code; no patent rights are granted by the code license.
