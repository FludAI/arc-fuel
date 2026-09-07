# arc-fuel — wNEWS Base ⇄ Arc bridge, animated

Five scenes, 61s, looping. Built from `docs/BRIDGE-MAP.md`, `SECURITY.md` and `README.md`
in `FludAI/arc-fuel`.

## Files

- `bridge-map-standalone.html` — open in any browser. No server, no build.
- `Bridge Map.dc.html` — the document. Holds the scene list and playback settings.
- `bridge-scenes.jsx` — the composition: palette, scene copy, geometry, the element tree.
- `animations-v3.jsx` — the timeline engine (unmodified).

## The one rule that must not be broken

`--fuel` is **wNEWS value in motion, and nothing else.**

    fuel   night #FF9D2E   day #C86A05
    used on: coins in escrow · the minted coin · coins in transit ·
             the cap gauge fill · the 100,000 figure
    never on: UI chrome, headers, buttons, rules, tickets, price prints,
             keys, or any information flow

Everything informational uses the neutral ramp (`ink` / `info` / `muted` / `dim`).
Red and green are **status only** — rejection, void, revert, pass.

The test: a viewer must be able to answer *"where is the money right now?"* purely by
finding the amber. The moment amber decorates a button or a heading it stops meaning
anything, and the palette stops teaching the bridge's most important fact — that
information is plentiful and value is scarce and always visible.

The hex differs between themes on purpose. `#FF9D2E` burns on black and goes washy on
paper. **The meaning is fixed; the hex is not.** Both are declared once in `THEMES` at the
top of `bridge-scenes.jsx` — change them there, never inline.

## Themes

Night is native. Day borrows viability.news paper (`#F7F7F4`, `#FFFFFF` cards, `#E2E2DA`
rules) so the two products read as one family — that kinship is the trust argument, not
decoration: grades come from viability.news and FUEL prices off those grades.

The toggle lives on the **stage wrapper**, outside the animated tree, so switching does not
disturb the timeline and a video export renders in whichever theme is selected.

## The five scenes

Each carries one non-negotiable fact, rendered as physics rather than asserted in a
caption. **Do not soften any of these.**

| # | Scene | The fact, and how it is shown |
|---|-------|-------------------------------|
| 1 | The ticket journey | Each Base lock mints **exactly once**. The lock hash travels as a neutral ticket; one amber coin appears on Arc; the used ticket visibly voids and is thrown back when presented again. |
| 2 | The end stop | The cap is a **physical end stop**, drawn as a bar past the gauge labelled "a constant — no setter exists". A further mint bounces off it. Admin has no function that moves it. |
| 3 | The drawbridge | **Pause blocks entries; exits always work.** The entry arm lifts to 62°; the exit is a welded-flat green span labelled "no pause check". Outbound coins keep flowing the whole time the gate is up. |
| 4 | One signal, many venues | Price is a **signed report from the one canonical Base pool**. There is no Arc market. A forged print shatters (no signature); a print past two hours flips the display to STALE and the read reverts. |
| 5 | Keys are shaped holes | **Keys ≠ powers.** Three keys seat into three differently-shaped holes. The admin key then rises toward a dashed "raise cap" outline on solid plate and drops back: *no such function*. |

The rail claim turns amber on the three value scenes and stays neutral on the information
scene, so the typography obeys the lane split too.

## Editing

**The scene list is the outline.** `window.OM_SCENES` in `Bridge Map.dc.html` is a JSON
string literal in a plain inline script — that is what makes the host timeline's trim and
speed gestures write back into the file. Pass it through untouched. Keep each `desc`
truthful when you change a scene; the user reads it in the timeline popover.

**Everything renders from `T`.** Never from `useEffect` or your own rAF — the exporter
seeks each frame with a synchronous commit and anything painted outside the render exports
stale. Scene ends are derived from the *next* cue (and `authoredTotal` for the last), so
changing a duration in `OM_SCENES` retimes the choreography with no second source to
update.

**Never put `data-om-exportable-video-with-duration-secs` on anything.** `CompositionStage`
owns it. A second exportable root silently breaks playback control and export.

## Two defect classes that recurred here

Both cost several rounds. Worth knowing before editing geometry.

**One thing, one object.** A duplicated ticket and later a duplicated coin each got "fixed"
by suppressing the copy rather than by modelling one object whose position interpolates.
Two amber coins for one lock directly contradicts the rail claim and the footer invariant.
If something moves, move it — do not draw it twice and hide one.

**Captions must agree with the picture.** For ~1.6s the gauge read 100K with a coin pressed
against the end stop while the footer said "filling toward the stop". The verdict now flips
on the gauge state, not on the bounce. A caption that disagrees with the frame is the one
failure this project cannot ship.

Also: labels are HTML positioned over the SVG at authored size, never `<text>`. Anything
anchored `'l'` or `'r'` near an edge needs a `w` budget, and coin travel lanes must be
checked against label boxes — several collisions came from a coin path crossing text.

## Data status

Every figure is from the repo docs: 100,000 MINT_CAP, the two-hour price age, the 1:1
lock/mint relationship, the role separations. The `0x7f3a…c1` ticket hash and the `$0.0412`
price are illustrative. Nothing connects to a chain.
