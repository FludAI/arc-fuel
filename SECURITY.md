# Security

## Threat model in three lines

- **Containment:** worst-case exposure is bounded by `MINT_CAP`
  (100,000 wNEWS) — a compromise of the relayer key or a bridge bug can
  never mint beyond it. The admin cannot raise the cap (it is a
  `constant`), and the admin address itself is `immutable`.
- **Response:** `setPaused(true)` stops all inflows. Redemptions
  (`bridgeOut`) deliberately work while paused — users can always exit.
- **Signal integrity:** the price signer is a data key with no funds
  authority; prints are replay-protected (digest binds contract address
  and chain id), monotonic, and `freshPrice()` reverts when stale rather
  than serving an old value.
- **Stake leg (`EngagementStake`, Base):** a staker's exit after the lock
  is never pausable and never admin-gated; the admin can attest a
  settlement but cannot touch a stake; the operator may act only at or
  under a cap each staker sets on-chain for themselves. Known limitation
  in this version: the premium's refund path credits the *first* funder
  of an engagement, so premiums must be funded by one party per
  engagement until v2 — do not rely on `fundPremium` from multiple
  parties on the same engagement.

## Reporting

Open a GitHub issue on this repository, or a private security advisory
(Security tab → Report a vulnerability) for anything exploitable.
Findings on these contracts (about 600 lines across six files) are
genuinely welcome — they are sized to be audited by inspection.

## Static analysis status

Slither (0.11.6, all 102 detectors) runs clean on `WNewsBridge.sol`,
`BaseLocker.sol`, `ServiceLedger.sol` and `TestWNEWS.sol` (0 findings
each). `AttestedPrice.sol` carries two and `EngagementStake.sol` one
informational `block-timestamp` finding, accepted by design: the 2-hour staleness
bound (`MAX_AGE`) is deliberately coarse — validator timestamp drift of
seconds cannot meaningfully move a bound of hours, and the alternative
(no staleness check) is strictly worse for an oracle consumer.
