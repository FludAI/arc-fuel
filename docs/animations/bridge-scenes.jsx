// (c) 2026 FludAI / viability.news - FUEL builds on patent-pending
// viability-grading technology (U.S. applications filed).
// bridge-scenes.jsx — the wNEWS Base⇄Arc bridge, five scenes.
//
// Palette discipline (the whole point): C.fuel is wNEWS VALUE IN MOTION and
// nothing else. Information — tickets, price prints, keys, chrome — uses the
// neutral ramp. Red/green are status only.

const { useComposition, CompositionStage, Shot, Easing, animate, clamp } = window;

// Night is the native ground. Day borrows viability.news paper (#F7F7F4) so the
// two products read as one family. --fuel shifts hue slightly between them
// because amber that burns on black goes washy on paper — the MEANING is what
// is fixed, not the hex.
const THEMES = {
  night: {
    fuel: '#FF9D2E', fuelDim: 'rgba(255,157,46,.22)', fuelGlow: 'rgba(255,157,46,.13)',
    bg: '#0B0D10', panel: '#12161C', panel2: '#161B22', line: '#262C36', line2: '#333B46',
    ink: '#E9ECF1', info: '#C9D4E2', muted: '#98A3B2', dim: '#717C8A',
    rule: '#1D232B', chrome: 'rgba(255,255,255,.05)', wash: 'rgba(255,255,255,.012)',
    ok: '#2FBF71', bad: '#F0453F', brand: '#5B3DF5'
  },
  day: {
    fuel: '#C86A05', fuelDim: 'rgba(200,106,5,.16)', fuelGlow: 'rgba(200,106,5,.11)',
    bg: '#F7F7F4', panel: '#FFFFFF', panel2: '#FBFBF8', line: '#E2E2DA', line2: '#C8CDD6',
    ink: '#0B0D10', info: '#2E3946', muted: '#5F6B7A', dim: '#7B8694',
    rule: '#E6E6E0', chrome: 'rgba(11,13,16,.05)', wash: 'rgba(11,13,16,.014)',
    ok: '#0B7A40', bad: '#C2201A', brand: '#5B3DF5'
  }
};

// live theme, swapped by the toggle; every builder reads through this binding
let C = THEMES.night;

const MOTION = {
  enter: (from, to, start, end) => animate({ from, to, start, end, ease: Easing.easeOutCubic }),
  draw:  (from, to, start, end) => animate({ from, to, start, end, ease: Easing.easeInOutCubic }),
  pop:   (from, to, start, end) => animate({ from, to, start, end, ease: Easing.easeOutBack })
};

const SCENES = [
  { name: 'Ticket', lane: 'value', title: 'The ticket journey',
    claim: 'Each Base lock mints exactly once.',
    support: 'The lock transaction hash is the claim ticket. Minting on Arc is idempotent per ticket and relayer-only, so a used ticket visibly voids — re-presenting it reverts.',
    anchor: 'BaseLocker.lock → WNewsBridge.bridgeIn · processed[baseLockTx]' },
  { name: 'Cap', lane: 'value', title: 'The end stop',
    claim: 'Arc supply can never exceed 100,000 wNEWS.',
    support: 'MINT_CAP is a constant and the admin address is immutable. There is no function that raises it — only a redeploy, which is a new contract and a new decision.',
    anchor: 'WNewsBridge.MINT_CAP = 100_000e18 · constant' },
  { name: 'Pause', lane: 'value', title: 'The drawbridge',
    claim: 'Pause blocks entries. Exits always work.',
    support: 'setPaused gates bridgeIn only. bridgeOut carries no pause check by design, and release on Base is deliberately not pausable — so an exit that starts always lands.',
    anchor: 'setPaused → bridgeIn · bridgeOut unguarded · release not pausable' },
  { name: 'Price', lane: 'info', title: 'One signal, many venues',
    claim: 'There is no Arc market. Price is a signed report.',
    support: 'Every print comes from the one canonical wNEWS/USDC pool on Base. A forged print has no valid signature. A print older than two hours makes freshPrice revert rather than serve a stale number.',
    anchor: 'AttestedPrice.post → PricePosted · freshPrice reverts past MAX_AGE' },
  { name: 'Keys', lane: 'roles', title: 'Keys are shaped holes',
    claim: 'Holding a key is not holding a power.',
    support: 'The admin can pause inflows and rotate the relayer. It cannot raise the cap, mint, take funds, or block an exit — there is no keyhole cut for any of that.',
    anchor: 'admin immutable · relayer is data-plane only · signer never a funds key' }
];

// ── geometry helpers ─────────────────────────────────────────────────
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, x) => a + (b - a) * x;

function along(pts, x) {
  if (x <= 0) return pts[0];
  if (x >= 1) return pts[pts.length - 1];
  const segs = pts.length - 1;
  const f = x * segs, k = Math.floor(f), r = f - k;
  const a = pts[k], b = pts[k + 1];
  return { x: lerp(a.x, b.x, r), y: lerp(a.y, b.y, r) };
}

const VW = 960, VH = 520;

function box(x, y, w, h, o) {
  o = o || {};
  return { kind: 'rect', x, y, w, h, r: o.r === undefined ? 10 : o.r,
    fill: o.fill || C.panel, stroke: o.stroke || C.line, sw: o.sw || 1.5,
    dash: o.dash || 'none', o: o.o === undefined ? 1 : o.o };
}
function coin(x, y, r, o) {
  return { kind: 'circle', x, y, r, fill: C.fuel, stroke: 'none', sw: 0,
    o: o === undefined ? 1 : o };
}
function dot(x, y, r, fill, o) {
  return { kind: 'circle', x, y, r, fill, stroke: 'none', sw: 0, o: o === undefined ? 1 : o };
}
function ring(x, y, r, stroke, sw, fill, o) {
  return { kind: 'circle', x, y, r, fill: fill || 'none', stroke, sw,
    o: o === undefined ? 1 : o };
}
function line(d, stroke, sw, o, dash) {
  return { kind: 'path', d, fill: 'none', stroke, sw, dash: dash || 'none',
    o: o === undefined ? 1 : o };
}

// Labels are HTML over the SVG, at authored size. `w` caps the text box so a
// long label can wrap instead of running off the diagram.
function tx(text, x, y, o) {
  o = o || {};
  const anchor = o.anchor || 'c';
  return { text, style: {
    position: 'absolute',
    left: (x / VW * 100) + '%', top: (y / VH * 100) + '%',
    transform: 'translate(' + (anchor === 'l' ? '0' : anchor === 'r' ? '-100%' : '-50%') + ',-50%)',
    width: o.w ? (o.w / VW * 100) + '%' : 'auto',
    textAlign: anchor === 'l' ? 'left' : anchor === 'r' ? 'right' : 'center',
    fontFamily: o.sans ? "'Instrument Sans',sans-serif" : "'JetBrains Mono',monospace",
    fontSize: o.size || 13,
    fontWeight: o.bold ? 600 : 400,
    letterSpacing: o.caps ? '.15em' : o.sans ? '-0.01em' : '.02em',
    textTransform: o.caps ? 'uppercase' : 'none',
    color: o.color || C.muted,
    opacity: o.o === undefined ? 1 : o.o,
    whiteSpace: o.w ? 'normal' : 'nowrap',
    lineHeight: 1.35, pointerEvents: 'none'
  } };
}

// ── scene 1 · the ticket journey ─────────────────────────────────────
function sceneTicket(u) {
  const S = [], R = [], P = [], L = [];

  S.push(box(48, 88, 300, 344, { fill: C.wash, r: 14 }));
  S.push(box(612, 88, 300, 344, { fill: C.wash, r: 14 }));
  L.push(tx('base · canonical home', 198, 108, { caps: true, size: 12, color: C.dim }));
  L.push(tx('arc · bridged outpost', 762, 108, { caps: true, size: 12, color: C.dim }));

  S.push(box(96, 148, 204, 62));
  S.push(box(96, 268, 204, 104, { fill: C.panel2 }));
  S.push(box(660, 268, 204, 104, { fill: C.panel2 }));
  S.push(box(660, 148, 204, 62));
  L.push(tx('your Base wallet', 198, 179, { color: C.info, size: 15, sans: true }));
  L.push(tx('lock escrow', 198, 292, { caps: true, size: 12, color: C.dim }));
  L.push(tx('bridge contract', 762, 292, { caps: true, size: 12, color: C.dim }));
  L.push(tx('agents pay & get paid', 762, 179, { color: C.info, size: 15, sans: true }));

  S.push(box(430, 178, 100, 54, { fill: C.bg, stroke: C.line2, r: 8, dash: '4 3' }));
  L.push(tx('relayer', 480, 205, { size: 13, color: C.muted }));

  const drop = seg(u, 0.02, 0.16);
  const print = seg(u, 0.17, 0.26);
  const cross = seg(u, 0.28, 0.50);
  const mint = seg(u, 0.50, 0.62);
  const voided = seg(u, 0.63, 0.73);
  const retry = seg(u, 0.78, 0.94);

  // value leaves the wallet and lands in escrow
  if (drop > 0) {
    const y = lerp(179, 320, ease(drop));
    R.push(dot(198, y, 26, C.fuelGlow));
    R.push(coin(198, y, 11));
  }
  if (drop >= 1) L.push(tx('locked', 198, 352, { size: 12, caps: true, color: C.fuel }));

  // the ticket is information about value, never value — so it stays neutral
  if (print > 0 && retry <= 0) {
    const o = Math.min(1, print * 2);
    const p = along([{ x: 198, y: 398 }, { x: 480, y: 258 }, { x: 762, y: 398 }], ease(cross));
    const dead = voided > 0;
    S.push(box(p.x - 62, p.y - 15, 124, 30,
      { fill: C.bg, stroke: dead ? C.dim : C.info, r: 5, o: o * (dead ? 0.6 : 1) }));
    L.push(tx('0x7f3a…c1', p.x, p.y, { size: 13, color: dead ? C.dim : C.info, o }));
    if (dead) L.push(tx('void', p.x + 48, p.y - 24,
      { size: 11, caps: true, color: C.bad, o: Math.min(1, voided * 3) }));
  }

  // exactly one coin, matching the one locked
  if (mint > 0) {
    const s = ease(mint);
    const up = seg(u, 0.66, 0.78);
    const y = lerp(320, 214, ease(up));
    R.push(dot(762, y, 26 * s, C.fuelGlow));
    R.push(coin(762, y, 11 * s));
    if (mint >= 1) L.push(tx('minted · 1:1', 762, 352, { size: 12, caps: true, color: C.fuel }));
  }

  // presenting the used ticket a second time
  if (retry > 0) {
    // it leaves Arc, reaches the relayer, and is thrown back
    const b = retry < 0.55 ? ease(retry / 0.55) : 1 - ease((retry - 0.55) / 0.45) * 0.42;
    const x = lerp(762, 520, b);
    S.push(box(x - 62, 383, 124, 30, { fill: C.bg, stroke: C.bad, r: 5, o: 0.92 }));
    L.push(tx('0x7f3a…c1', x, 398, { size: 13, color: C.bad }));
    L.push(tx('void', x + 48, 375, { size: 11, caps: true, color: C.bad }));
    if (retry > 0.5) L.push(tx('already processed — reverts', 480, 452,
      { size: 14, color: C.bad, o: Math.min(1, (retry - 0.5) * 5) }));
  }

  return { S, R, P, L, verdict: voided > 0 ? 'one ticket · one mint · never twice' : 'lock → attest → mint' };
}

// ── scene 2 · the end stop ───────────────────────────────────────────
function sceneCap(u) {
  const S = [], R = [], P = [], L = [];
  const X0 = 152, X1 = 620, Y = 248, H = 78;

  L.push(tx('worst case, priced', 480, 132, { size: 21, sans: true, bold: true, color: C.ink }));
  L.push(tx('a compromised relayer key cannot mint past this line', 480, 164,
    { size: 15, sans: true, color: C.muted }));

  S.push(box(X0, Y, X1 - X0, H, { r: 6 }));

  // the stop is a physical end, not a policy
  S.push(box(X1, Y - 18, 16, H + 36, { fill: C.line2, stroke: C.ink, r: 3, sw: 2 }));
  L.push(tx('mint_cap', X1 + 34, Y - 62, { anchor: 'l', size: 12, caps: true, color: C.ink }));
  L.push(tx('100,000 wNEWS', X1 + 34, Y - 36,
    { anchor: 'l', size: 19, color: C.fuel, bold: true, sans: true }));
  L.push(tx('a constant — no setter exists', X1 + 34, Y - 10,
    { anchor: 'l', size: 13, color: C.dim, w: 290 }));

  const filled = ease(seg(u, 0.05, 0.52));
  const w = (X1 - X0) * filled;
  if (w > 2) {
    S.push(box(X0, Y, w, H, { fill: C.fuelDim, stroke: 'none', sw: 0, r: 6 }));
    S.push(box(X0, Y, w, H, { fill: 'none', stroke: C.fuel, sw: 2, r: 6 }));
  }
  for (let k = 1; k < 5; k++) {
    const x = X0 + (X1 - X0) * (k / 5);
    if (filled > k / 5) S.push(box(x - 0.75, Y + 12, 1.5, H - 24,
      { fill: C.fuelDim, stroke: 'none', sw: 0, r: 0 }));
  }
  L.push(tx(Math.round(filled * 100) + 'K locked & minted', X0 + 18, Y + H / 2,
    { anchor: 'l', size: 19, sans: true, bold: true, color: filled >= 1 ? C.fuel : C.ink }));

  // a further mint bounces off it
  const push = seg(u, 0.56, 0.80);
  if (push > 0) {
    const b = push < 0.5 ? ease(push / 0.5) : 1 - ease((push - 0.5) / 0.5) * 0.75;
    const x = lerp(880, X1 + 40, b);
    R.push(dot(x, Y + H / 2, 26, C.fuelGlow));
    R.push(coin(x, Y + H / 2, 11));
    if (push > 0.45) L.push(tx('reverts · cap reached', 786, Y + H + 30,
      { size: 14, color: C.bad, o: Math.min(1, (push - 0.45) * 4) }));
  }

  L.push(tx('the admin key has no function that moves it', 480, 448,
    { size: 15, sans: true, color: C.muted }));

  return { S, R, P, L, verdict: push > 0.45 ? 'bounded by construction'
    : filled >= 1 ? 'at the cap · nothing further can mint' : 'filling toward the stop' };
}

// ── scene 3 · the drawbridge ─────────────────────────────────────────
function scenePause(u) {
  const S = [], R = [], P = [], L = [];

  S.push(box(48, 88, 300, 344, { fill: C.wash, r: 14 }));
  S.push(box(612, 88, 300, 344, { fill: C.wash, r: 14 }));
  L.push(tx('base', 198, 108, { caps: true, size: 12, color: C.dim }));
  L.push(tx('arc', 762, 108, { caps: true, size: 12, color: C.dim }));

  const paused = seg(u, 0.24, 0.40);
  const blocked = paused >= 0.5;

  L.push(tx('entry · bridgeIn', 414, 150, { anchor: 'r', size: 13, caps: true, color: blocked ? C.bad : C.muted }));
  const rad = ease(paused) * 62 * Math.PI / 180;
  const bx = 430, by = 196, len = 100;
  P.push(line('M ' + bx + ' ' + by + ' L ' + (bx + len * Math.cos(-rad)) + ' ' + (by + len * Math.sin(-rad)),
    blocked ? C.bad : C.info, 5));
  S.push(box(bx - 7, by - 7, 14, 14, { fill: C.line2, stroke: C.dim, r: 3, sw: 1 }));
  if (paused > 0.6) L.push(tx('paused', 414, 176, { anchor: 'r', size: 12, caps: true, color: C.bad, o: ease(paused) }));

  // the exit is welded open — no pause check anywhere on this path
  L.push(tx('exit · bridgeOut', 480, 382, { size: 13, caps: true, color: C.ok }));
  P.push(line('M 430 336 L 530 336', C.ok, 5));
  L.push(tx('no pause check', 480, 410, { size: 12, caps: true, color: C.ok }));

  const inU = (u * 2.6) % 1;
  if (!blocked) {
    const p = along([{ x: 260, y: 196 }, { x: 700, y: 196 }], inU);
    R.push(coin(p.x, p.y, 10));
  } else {
    const b = inU < 0.5 ? inU / 0.5 : 1 - (inU - 0.5) / 0.5;
    R.push(coin(lerp(220, 404, ease(b)), 196, 10));
    if (inU > 0.45 && inU < 0.72) L.push(tx('blocked', 404, 228, { size: 13, color: C.bad }));
  }

  // outbound value never stops
  for (let k = 0; k < 3; k++) {
    const o = ((u * 2.2) + k * 0.34) % 1;
    const p = along([{ x: 700, y: 336 }, { x: 260, y: 336 }], o);
    R.push(coin(p.x, p.y, 10, 0.55 + 0.45 * Math.sin(o * Math.PI)));
  }

  L.push(tx('the drawbridge goes up · everyone inside can still leave', 480, 466,
    { size: 15, sans: true, color: C.muted }));

  return { S, R, P, L, verdict: blocked ? 'entries blocked · exits open' : 'both lanes open' };
}

// ── scene 4 · one signal, many venues ────────────────────────────────
function scenePrice(u) {
  const S = [], R = [], P = [], L = [];

  S.push(box(48, 88, 300, 344, { fill: C.wash, r: 14 }));
  S.push(box(612, 88, 300, 344, { fill: C.wash, r: 14 }));
  L.push(tx('base · the only market', 198, 108, { caps: true, size: 12, color: C.dim }));
  L.push(tx('arc · no pool, by design', 762, 108, { caps: true, size: 12, color: C.dim }));

  const beat = (u * 5) % 1;
  const pulse = 1 + 0.09 * Math.sin(beat * Math.PI * 2);
  R.push(dot(198, 258, 62 * pulse, C.wash));
  R.push(ring(198, 258, 44 * pulse, C.info, 2, C.panel2));
  L.push(tx('wNEWS / USDC', 198, 324, { size: 14, color: C.info }));
  L.push(tx('the only venue', 198, 346, { size: 12, color: C.dim }));
  L.push(tx('there is no second market to fork the signal', 198, 392,
    { size: 15, sans: true, color: C.muted, w: 268 }));

  S.push(box(430, 232, 100, 52, { fill: C.bg, stroke: C.line2, r: 8, dash: '4 3' }));
  L.push(tx('signer', 480, 258, { size: 13, color: C.muted }));

  S.push(box(672, 210, 180, 96, { fill: C.panel2 }));
  L.push(tx('attested price', 762, 232, { caps: true, size: 12, color: C.dim }));

  const forge = seg(u, 0.40, 0.58);
  const stale = seg(u, 0.66, 0.90);

  // prints are information — neutral, plentiful
  for (let k = 0; k < 3; k++) {
    const o = ((u * 2.4) + k * 0.33) % 1;
    const p = along([{ x: 250, y: 258 }, { x: 480, y: 258 }, { x: 660, y: 258 }], o);
    R.push(dot(p.x, p.y, 6, C.info, 0.35 + 0.65 * Math.sin(o * Math.PI)));
  }

  if (forge > 0 && forge < 1) {
    const p = along([{ x: 480, y: 452 }, { x: 640, y: 296 }], Math.min(1, forge * 1.7));
    if (forge <= 0.58) {
      R.push(ring(p.x, p.y, 7, C.bad, 2));
    } else {
      const s = (forge - 0.58) / 0.42;
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2;
        R.push(dot(640 + Math.cos(a) * 30 * s, 296 + Math.sin(a) * 30 * s, 3, C.bad, 1 - s));
      }
    }
    L.push(tx('no valid signature — rejected', 552, 472, { size: 14, color: C.bad }));
  }

  const old = stale > 0.35;
  L.push(tx(old ? 'stale' : '$0.0412', 762, 266,
    { size: old ? 19 : 28, sans: true, bold: true, caps: old,
      color: old ? C.bad : C.ink }));
  L.push(tx(old ? 'older than 2h · the read reverts' : 'signed print · 4 min old', 762, 294,
    { size: 12.5, color: old ? C.bad : C.dim }));
  L.push(tx('apps refuse loudly — never a silently old number', 762, 362,
    { size: 15, sans: true, color: C.muted, w: 268 }));

  return { S, R, P, L,
    verdict: old ? 'stale prints revert' : forge > 0 ? 'forged print rejected' : 'one signed signal' };
}

// ── scene 5 · keys are shaped holes ──────────────────────────────────
function sceneKeys(u) {
  const S = [], R = [], P = [], L = [];

  S.push(box(196, 176, 568, 200, { stroke: C.line2, r: 14, sw: 2 }));
  L.push(tx('what the contracts will accept', 480, 146, { caps: true, size: 13, color: C.dim }));

  const holes = [
    { x: 316, k: 'admin', power: 'pause inflows', shape: 'circle' },
    { x: 480, k: 'relayer', power: 'mint against a ticket', shape: 'square' },
    { x: 644, k: 'signer', power: 'validate a print', shape: 'tri' }
  ];

  holes.forEach((h, n) => {
    const arrive = seg(u, 0.06 + n * 0.13, 0.30 + n * 0.13);
    const seated = arrive >= 1;
    const edge = seated ? C.ok : C.line2;
    if (h.shape === 'circle') S.push({ kind: 'circle', x: h.x, y: 250, r: 17,
      fill: C.bg, stroke: edge, sw: 2, o: 1 });
    else if (h.shape === 'square') S.push(box(h.x - 16, 234, 32, 32,
      { fill: C.bg, stroke: edge, r: 3, sw: 2 }));
    else P.push({ kind: 'path', d: 'M ' + h.x + ' 232 L ' + (h.x + 17) + ' 266 L ' + (h.x - 17) + ' 266 Z',
      fill: C.bg, stroke: edge, sw: 2, dash: 'none', o: 1 });

    if (arrive > 0) R.push(dot(h.x, lerp(452, 250, ease(arrive)), 8, seated ? C.ok : C.info));

    // these two lines carry the scene's argument, so they read at full strength
    L.push(tx(h.k, h.x, 304, { size: 13, caps: true, color: seated ? C.ok : C.muted }));
    L.push(tx(h.power, h.x, 330, { size: 14, sans: true, color: seated ? C.info : C.muted }));
  });

  // the hole that was never cut
  const raise = seg(u, 0.62, 0.90);
  S.push(box(404, 194, 152, 28, { fill: 'none', stroke: C.line2, r: 5, dash: '4 4' }));
  L.push(tx('raise cap', 480, 208, { size: 12, caps: true, color: C.muted }));
  if (raise > 0) {
    const b = raise < 0.45 ? ease(raise / 0.45) : 1 - ease((raise - 0.45) / 0.55) * 0.8;
    R.push(dot(480, lerp(250, 232, b), 8, C.info));
    if (raise > 0.4) L.push(tx('no such function', 480, 416,
      { size: 18, sans: true, bold: true, color: C.bad, o: Math.min(1, (raise - 0.4) * 4) }));
  }

  L.push(tx('admin cannot raise the cap, mint, take funds, or block an exit', 480, 464,
    { size: 15, sans: true, color: C.muted }));

  return { S, R, P, L, verdict: raise > 0.4 ? 'keys are not powers' : 'each key fits one hole' };
}

const BUILDERS = [sceneTicket, sceneCap, scenePause, scenePrice, sceneKeys];

// ── the one element tree ─────────────────────────────────────────────
function Piece(props) {
  const { T, CUES, authoredTotal } = useComposition();
  C = THEMES[props.theme] || THEMES.night;

  const starts = SCENES.map(s => CUES[s.name]);
  const ends = starts.map((s, n) => (n + 1 < starts.length ? starts[n + 1] : authoredTotal));

  let active = 0;
  for (let n = 0; n < starts.length; n++) if (T >= starts[n]) active = n;
  const A = SCENES[active];
  const built = BUILDERS[active](clamp((T - starts[active]) / (ends[active] - starts[active]), 0, 1));
  const laneColor = A.lane === 'value' ? C.fuel : C.info;

  const svgEl = (s, i) => {
    if (s.kind === 'rect') return React.createElement('rect', { key: i,
      x: s.x, y: s.y, width: s.w, height: s.h, rx: s.r, fill: s.fill,
      stroke: s.stroke, strokeWidth: s.sw, strokeDasharray: s.dash, opacity: s.o });
    if (s.kind === 'circle') return React.createElement('circle', { key: i,
      cx: s.x, cy: s.y, r: s.r, fill: s.fill, stroke: s.stroke,
      strokeWidth: s.sw, opacity: s.o });
    return React.createElement('path', { key: i, d: s.d, fill: s.fill,
      stroke: s.stroke, strokeWidth: s.sw, strokeDasharray: s.dash,
      strokeLinecap: 'round', opacity: s.o });
  };

  return React.createElement('div', {
    style: { position: 'absolute', inset: 0, background: C.bg, color: C.ink,
      fontFamily: "'Instrument Sans',system-ui,sans-serif", display: 'flex',
      flexDirection: 'column', overflow: 'hidden' }
  },
    // header
    React.createElement('div', { key: 'h', style: { flex: 'none', display: 'flex',
      alignItems: 'center', gap: 12, padding: '18px 34px',
      borderBottom: '1px solid ' + C.rule } },
      React.createElement('span', { style: { width: 12, height: 12, borderRadius: 3, background: C.brand } }),
      React.createElement('span', { style: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em',
        whiteSpace: 'nowrap', flex: 'none' } },
        'arc', React.createElement('span', { style: { color: C.muted, fontWeight: 500 } }, '-fuel')),
      React.createElement('span', { style: { fontFamily: "'JetBrains Mono',monospace",
        fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', color: C.dim,
        whiteSpace: 'nowrap', flex: 'none' } },
        'wNEWS · Base ⇄ Arc'),
      React.createElement('span', { style: { marginLeft: 'auto', display: 'flex',
        alignItems: 'center', gap: 11, fontFamily: "'JetBrains Mono',monospace",
        fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap' } },
        React.createElement('span', { style: { width: 9, height: 9, borderRadius: 2, background: C.fuel } }),
        'amber is value · all else is information'),
      React.createElement('button', { type: 'button', onClick: props.onToggle,
        style: { marginLeft: 20, flex: 'none', border: '1px solid ' + C.line2,
          background: C.chrome, color: C.muted, borderRadius: 999, padding: '7px 15px',
          cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
          letterSpacing: '.14em', textTransform: 'uppercase' } },
        props.theme === 'day' ? 'night' : 'day')),

    React.createElement('div', { key: 'b', style: { flex: 1, minHeight: 0, display: 'flex' } },

      // rail
      React.createElement('div', { style: { flex: 'none', width: 400, display: 'flex',
        flexDirection: 'column', borderRight: '1px solid ' + C.rule, padding: '26px 30px' } },
        React.createElement('div', { style: { fontFamily: "'JetBrains Mono',monospace",
          fontSize: 12.5, letterSpacing: '.18em', textTransform: 'uppercase', color: C.dim,
          whiteSpace: 'nowrap' } },
          'scene ' + (active + 1) + ' of 5 · ' + A.lane),
        React.createElement('h1', { style: { margin: '12px 0 0', fontSize: 34, lineHeight: 1.08,
          letterSpacing: '-0.03em', fontWeight: 400, color: C.ink } }, A.title),
        React.createElement('p', { style: { margin: '18px 0 0', fontSize: 21, lineHeight: 1.3,
          fontWeight: 600, letterSpacing: '-0.015em', color: laneColor } }, A.claim),
        React.createElement('p', { style: { margin: '14px 0 0', fontSize: 17, lineHeight: 1.5,
          color: C.muted } }, A.support),
        React.createElement('div', { style: { marginTop: 18, paddingTop: 14,
          borderTop: '1px solid ' + C.line, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 13, lineHeight: 1.55, color: C.dim } }, A.anchor),
        React.createElement('div', { style: { marginTop: 'auto', display: 'flex',
          flexDirection: 'column', gap: 3 } },
          SCENES.map((s, n) => React.createElement('div', { key: s.name,
            style: { display: 'flex', alignItems: 'center', gap: 11,
              background: n === active ? C.chrome : 'none',
              borderLeft: '2px solid ' + (n === active
                ? (s.lane === 'value' ? C.fuel : C.info) : 'transparent'),
              padding: '8px 11px', borderRadius: '0 5px 5px 0' } },
            React.createElement('span', { style: { fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12, color: n === active ? C.ink : C.dim } },
              String(n + 1).padStart(2, '0')),
            React.createElement('span', { style: { flex: '1 1 auto', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 15.5, letterSpacing: '-0.01em',
              color: n === active ? C.ink : C.muted } }, s.title),
            React.createElement('span', { style: { fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
              color: s.lane === 'value' ? C.fuel : C.dim,
              opacity: n === active ? 1 : 0.55 } }, s.lane))))),

      // stage
      React.createElement('div', { style: { flex: 1, minWidth: 0, display: 'flex',
        flexDirection: 'column', padding: '22px 30px 16px' } },
        React.createElement('div', { style: { flex: 1, minHeight: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center' } },
          React.createElement('div', { style: { position: 'relative', width: '100%',
            aspectRatio: '960 / 520' } },
            React.createElement('svg', { viewBox: '0 0 960 520',
              preserveAspectRatio: 'xMidYMid meet',
              style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' } },
              built.S.map(svgEl),
              built.P.map((s, i) => svgEl(s, 'p' + i)),
              built.R.map((s, i) => svgEl(s, 'r' + i))),
            built.L.map((l, i) => React.createElement('div', { key: 'l' + i, style: l.style }, l.text)))),
        React.createElement('div', { style: { flex: 'none', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingTop: 14,
          borderTop: '1px solid ' + C.rule, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 13.5, whiteSpace: 'nowrap' } },
          React.createElement('span', { style: { color: C.dim } },
            'invariant · ',
            React.createElement('span', { style: { color: C.info } }, 'Arc supply equals Base locked'),
            ' · both ≤ ',
            React.createElement('span', { style: { color: C.fuel } }, '100,000 wNEWS')),
          React.createElement('span', { style: { color: laneColor, letterSpacing: '.04em' } },
            built.verdict)))));
}

function BridgeMap() {
  const [theme, setTheme] = React.useState('night');
  const toggle = React.useCallback(() => {
    setTheme(t => (t === 'night' ? 'day' : 'night'));
  }, []);
  return React.createElement(CompositionStage, {
    width: 1440, height: 810,
    scenes: window.OM_SCENES,
    playback: window.OM_PLAYBACK,
    bg: THEMES[theme].bg
  }, React.createElement(Piece, { theme: theme, onToggle: toggle }));
}

window.BridgeMap = BridgeMap;
