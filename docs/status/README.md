# arc-fuel — wNEWS bridge status page

Live status surface, built from `docs/STATUS-PAGE-SPEC.md`. Same design language as the
bridge map animation (`handoff-bridge/`) — read that README's palette section first; the
tokens here are copied from it verbatim.

## Files

- `status-page-standalone.html` — open in any browser. No server, no build.
- `Status Page.dc.html` — editable source.

## The one rule that must not be broken

`--fuel` is **wNEWS value, and nothing else.**

    fuel   night #FF9D2E   day #C86A05
    used on: the two supply figures · the gauge fill and its leading edge ·
             value amounts in the activity log · the near-cap warning
    never on: UI chrome, headers, buttons, rules, price prints, rejections,
             relayer rows, or any information flow

Information uses the neutral ramp (`ink` / `info` / `muted` / `dim`). Red and green are
**status only** — the `=` sign, open/paused, rejected, revert.

The test: a viewer answers *"where is the money right now?"* purely by finding the amber.
The hex differs per theme on purpose — amber that burns on black goes washy on paper. **The
meaning is fixed; the hex is not.** Both live in `THEMES` at the top of the logic class.

## Motion is state-driven, never looping

Deliberate departure from the animation piece: on a status page a looping animation implies
activity that may not be happening. What moves, and why:

- **Arriving log entries** animate in (`rowIn`) when the bridge actually mints or releases.
  Nothing arrives while entries are paused — the stillness is the signal.
- **The gauge fill** transitions its width when locked supply changes (1.1s ease).
- **The stale price card** shakes once on entering the stale state.
- **The price age** is the only always-running clock, because age advances whether or not
  anything happens.

Do not add ambient pulses, marquees, or idle shimmer. If it moves, a state changed.

## Layout — the rule that cost six review rounds

The page is `100vh`, no page scroll. Four regions stacked:

    header    flex:none    wordmark · legend · simulate · theme toggle
    body      flex:1       hero → card grid → activity log
    footer    flex:none    guarantee toggle · invariant note

**Exactly ONE region per axis may absorb slack. Every other region is intrinsic.**

Vertically that region is the **activity log** (`flex:1 1 auto; min-height:116px`); the hero
and the card grid are both `flex:none`. Horizontally in the header it is the **simulate
group** and (formerly) the eyebrow; the theme toggle is `flex:none` because it is a control
the user asked for and must never be the thing that falls off the edge.

Six consecutive review failures came from violating this in different places: making
everything `flex:none` starved the log to zero; pinning only the hero moved the starvation
onto the grid; leaving the grid elastic let the log sit 57px above its own floor while cards
amputated their third line. If a region is being clipped, check which sibling is greedily
absorbing slack — do not add another `min-height` floor.

## Ranking, not sizing

When the height budget does not close, **remove content from the visible stack** — do not
shrink type, which only defers the failure to a shorter viewport.

Two applications of that here, both worth preserving:

- **Cards hold two lines** (title + value + one state note). The four guarantee lines live
  behind the footer's **"What these cannot do"** toggle, which swaps the entire card grid
  for a four-row proof panel reusing the same box. Guarantees are proof, and proof belongs
  behind a disclosure — stacking them into a 69px card clipped all four.
- **The cap constant lives in the footer**, not in a second hero block. The hero already
  overflowed its box trying to carry it.

## No `-webkit-line-clamp` in this codebase

`display:'-webkit-box'` computes to `flow-root` through React's style object, so the clamp
silently degrades to a bare `overflow:hidden` crop and `text-overflow:ellipsis` never
paints — truncation reads as broken copy rather than as truncation. The card notes are
instead **written to fit** the 183px × 2-line column (~44 chars). If you lengthen one, check
it still fits; do not reintroduce a clamp.

## What the screen argues

**The invariant is the hero**, at the largest type on the page: `Arc totalSupply = Base
locked`, both amber, green `=` between them. Every mint has a lock behind it — that is what
the bridge rests on, so it gets the most space.

**The gauge is the same instrument as the animation's scene 2** — amber fill, hard end-stop
bar, headroom to `MINT_CAP`. Near the cap the read and its label turn amber.

**Entries and exits are separate cards, never one "bridge status" pill.** This is the
spec's most important asymmetry: pausing turns entries red while exits stay green, with the
guarantee *"release on Base is deliberately not pausable — an exit that starts, lands."*
Do not merge them into a single health indicator.

**The log carries the lane split.** Value rows get an amber circle and an amber bold figure;
price prints get a neutral square; rejections are red. That is the palette rule doing work
rather than decorating.

## The simulate controls

Four buttons in the header — `nominal · entries paused · stale price · near cap` — drive the
state machine so every transition is reviewable without a chain. **These are a review
affordance and probably should not ship**; they are in the header (not the footer) only
because the footer needed to stay one row. Delete them and wire the state from real reads.

## Data status

Every rule and figure is from the repo docs: 100,000 `MINT_CAP`, the 2h `MAX_AGE`, the 1:1
lock/mint relationship, per-ticket idempotency, the role separations. The supply numbers,
block height, ticket hashes, `$0.0412` price and relayer timings are illustrative. Nothing
connects to a chain.
