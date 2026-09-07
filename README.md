# FUEL × Arc — wNEWS bridged utility, single signal

ETHOnline 2026 submission repo. All code here is written during the event
window, committed granularly for line-by-line review.

FUEL (outcome-financed AI agents for small business) keeps its price
signal on Base — the canonical wNEWS/USDC Uniswap v3 pool — and brings
wNEWS to Arc mainnet for what FUEL needs there: agent payments and
engagement denomination on the chain where businesses already pay USDC.

Two contracts, both deliberately minimal (mainnet during a hackathon means
you price the blast radius, not claim perfection):

- `contracts/WNewsBridge.sol` — lock-on-Base / mint-on-Arc bridge.
  Hard mint cap, pausable, admin on a hardware-backed key. Small enough
  to audit by inspection.
- `contracts/AttestedPrice.sol` — Arc-side price consumer. There is
  intentionally NO Arc-side pool for wNEWS (a second market for the same
  asset would fork the price surface); price arrives as signed
  attestations from the pipeline that reads the canonical Base pool.
  One signal, many venues. The attestation signer is a data key, never a
  funds key.

Design doctrine and the wider FUEL system live in the main project
submission; this repo is scoped to the Arc integration only.
