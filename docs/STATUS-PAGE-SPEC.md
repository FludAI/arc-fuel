# Bridge status page — spec

The working counterpart to `docs/animations/` (which explains the bridge;
this page shows it *working*). One live animated stage + a tabular
companion under it. Audience: **business users and developers** deciding
whether to trust the rail — not judges, not crypto natives. Every number
gets a plain-language "what this means" line. The MCP/agent story needs
no selling to this audience; legibility and honesty do.

## Design language (identical to the animations — non-negotiable)

- Same `THEMES` tokens as `animations/bridge-scenes.jsx`:
  night `fuel #FF9D2E`, day `fuel #C86A05`; same neutral ramp
  (`ink/info/muted/dim`), same panel/line colors, viability.news paper
  in day theme. Theme toggle outside the animated tree.
- **The one rule:** amber = wNEWS value (locked balance, minted supply,
  coins in motion, the cap-gauge fill, the 100,000 figure) and nothing
  else. Price prints, tickets, roles, chrome: neutral. Red/green: status
  verdicts only (invariant holds/broken, fresh/stale, live/paused).
- Carry over both defect rules from the animations README: one thing =
  one object (never draw a value twice and hide one), and captions must
  agree with the picture at every instant (a caption that disagrees with
  the frame cannot ship).
- Typography, spacing, table styling may follow `wNEWS Swap Scenarios`
  (the operator console) so the family reads as one product line.

## Layout

### 1 · The stage (animated, live data)

The two-lane diagram from BRIDGE-MAP rendered live, not looping — its
motion is *driven by state changes*, idle otherwise:

- **Cap gauge with end stop** — fill = Arc `totalSupply` / 100,000 wNEWS
  (amber). The end stop labelled "a constant — no setter exists".
- **Invariant readout** (the page's heartbeat, always visible):
  `Arc supply` vs `Base locked`, both amber figures, with a green
  EQUAL badge when they match and a red discrepancy state when not
  (they should never not — say so: "if these ever differ, stop and ask
  why; nothing in the contracts can make them differ").
- **Drawbridge state** — entry arm up/down from `paused()` on both
  contracts; exit span permanently green-flat ("no pause check").
  When paused: "New entries paused by the hardware key. Exits still
  work — they always work."
- **Signal lane** — latest attested print (neutral panel): price, age
  ticking live toward the 2h staleness bound, signer address. Past 2h
  the panel greys and shows the same loud STALE refusal as scene 4.

### 2 · Tabular companion (under the stage)

Three tables, console-style (mono, right-aligned numerics):

- **Tickets** — one row per lock→mint→burn→release journey: Base lock
  tx (the ticket), amount (amber), Arc recipient, mint tx, current
  state (`locked / minted / burned / released`), explorer links.
  Empty state before the first ticket: "No tickets yet. The first lock
  on Base becomes row one." (Never fake a row.)
- **Prints** — recent `PricePosted` events: price, observed-at, age,
  posting tx. Caption: "Anyone may deliver a print; only the signer's
  signature makes one valid."
- **Roles** — the keys≠powers table from BRIDGE-MAP verbatim (admin /
  relayer / signer / any holder — power and cannot columns), with live
  addresses.

## Live data (all public reads, no keys, no backend)

Static HTML + `fetch` JSON-RPC, exactly like the Swap Scenarios console.
Poll every ~30s; a manual refresh button; if an RPC is unreachable show
an honest "RPC unreachable — showing last read from HH:MM" state, never
a stale number passing as live.

| Chain | RPC | Contract | Address |
|---|---|---|---|
| Base (8453) | `https://mainnet.base.org` | BaseLocker | `0x96D213E6d0fc3925F557d50D0d49e2Cd90a44E57` |
| Arc Testnet (5042002) | `https://rpc.testnet.arc.network` | WNewsBridge | `0x96D213E6d0fc3925F557d50D0d49e2Cd90a44E57` |
| Arc Testnet | 〃 | AttestedPrice | `0x64131A7Ef739e728fEae1F482D472F537446214e` |

(Yes, the two `0x96D2…` addresses are the same string on different
chains — same deployer, same nonce. Label chains loudly so this never
confuses a reader.)

Calls (standard ABI; `eth_call` + `eth_getLogs`):

- BaseLocker: `totalLocked() uint256`, `paused() bool`,
  event `Locked(address indexed sender, address indexed arcRecipient, uint256 amount)`,
  event `Released(address indexed to, uint256 amount, bytes32 indexed arcBurnTx)`
- WNewsBridge: `totalSupply() uint256`, `paused() bool`,
  `MINT_CAP() uint256`, `admin() address`, `relayer() address`,
  event `BridgedIn(address indexed to, uint256 amount, bytes32 indexed baseLockTx)`,
  event `BridgedOut(address indexed from, uint256 amount, address baseRecipient)`
- AttestedPrice: `price() uint256` (6-decimal USDC/wNEWS),
  `observedAt() uint64`, `signer() address`, `MAX_AGE() uint64`,
  event `PricePosted(uint256 price, uint64 observedAt, address indexed poster)`
- Ticket state joins on tx hashes: a `Locked` tx hash appearing as a
  `BridgedIn.baseLockTx` = minted; a `BridgedOut` tx hash appearing as
  a `Released.arcBurnTx` = released.
- Scan from deploy blocks: Base ≥ 51,023,850 · Arc ≥ 61,010,900.
- wNEWS amounts are 18-decimal. Arc gas/native is USDC (do not display
  native balances anywhere — out of scope for this page).

## Copy register

Plain, declarative, no crypto slang, no exclamation points. Each metric
carries one "what this means" line in `dim`, e.g.:

- totalLocked: "wNEWS held in the Base vault. Every Arc token is backed
  by exactly this."
- cap: "The most that can ever exist on Arc. Not a target — a ceiling."
- print age: "Price is a signed report from the one real market (Base).
  Older than 2 hours, apps refuse it."

Footer carries the standard notice line (© 2026 FludAI / viability.news,
MIT, patent-pending viability-grading technology) in `dim`, same as the
animations player.

## Out of scope (v1)

No wallet connection, no lock/burn actions from this page (read-only —
actions happen in the operator console / wallets), no historical charts,
no mainnet addresses until Circle publishes mainnet (then the page gets
a chain switcher, testnet clearly labelled).
