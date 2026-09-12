# Clear Signing (ERC-7730) — EngagementStake

`erc7730-EngagementStake.json` describes every state-changing function of
`EngagementStake` (Base, `0x3Dc8CB2e7fECAfE4302c1777a6C2a1c996aC5169`) so a
Ledger device can render the call in plain words instead of blind hex:

| Call | Device shows |
|---|---|
| `stake(engagementId, amount, lockSeconds)` | Stake wNEWS into an engagement · Engagement · Stake (wNEWS amount) · Locked for (duration) |
| `setCap(c)` | Set auto-approve cap · Cap per ask (wNEWS) |
| `exit(engagementId)` | Take your stake back after the lock |
| `fundPremium(engagementId, amount)` | Fund the success premium · Premium (wNEWS) |
| `settle(engagementId, success)` | Admin: attest outcome and settle |
| `setOperator(o)` | Admin: rotate the operator key |
| `setPaused(p)` | Admin: pause or resume NEW stakes (exits/settlements never paused) |

Why it matters here: the LLP leg is one signature (`stake`) from a wallet
that may be a Ledger; the admin leg (`settle`, `setOperator`, `setPaused`)
is *always* the Ledger. The two safety properties a signer most needs to
see — the exact amount and the lock — are first-class fields.

Status: descriptor authored 2026-09-12, validated against the ERC-7730 v1
JSON schema shape by inspection only. **Not yet submitted to Ledger's
clear-signing registry**, and not yet exercised on a device with the
Ledger Ethereum app's clear-signing path. Until that happens, a Ledger
signing `stake` shows the raw calldata; the mini app decodes and displays
the same fields on screen as the interim guard.

---
© 2026 FludAI / viability.news. Descriptor and code licensed MIT. FUEL builds on
patent-pending viability-grading technology (U.S. patent applications filed) — the
enabling grading/valuation system, not this descriptor; no patent rights are granted.
