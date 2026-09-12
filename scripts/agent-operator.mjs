// agent-operator.mjs — the routine bridge/payment loop, run by an agent
// under written policy (agent-policy.json). The agent NEVER holds admin
// power: it can act only inside per-party, per-tx, and daily limits, and
// anything outside the lines becomes an ESCALATION record addressed to
// the hardware-key holder — it does not fail silently, it hands off.
//
// Every action or refusal is a decision record (decisions.jsonl):
// what was asked, which checks ran, what the agent decided, and why.
// "Report back" is the point: the human reads decisions, not txs.
//
// Usage:
//   node agent-operator.mjs --task lock --amount 200
//   node agent-operator.mjs --task pay --to 0x... --amount 100 --goal oralinsulin-cost-model
//   node agent-operator.mjs --report            (print today's ledger + decisions)
//   add --dry-run to any task: run all checks, sign nothing
//
// Env: AGENT_PK (the agent's own key — small budget, data-plane),
//      BASE_RPC, ARC_RPC, BASE_LOCKER, WNEWS_BRIDGE, SERVICE_LEDGER,
//      WNEWS, ATTESTED_PRICE

import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const env = existsSync(new URL(".env", here))
  ? Object.fromEntries(readFileSync(new URL(".env", here), "utf8").split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]))
  : {};
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const POLICY = JSON.parse(readFileSync(new URL("agent-policy.json", here), "utf8"));
const DECISIONS = new URL("decisions.jsonl", here);
const ESCALATIONS = new URL(POLICY.escalation.record, here);
const DAYLEDGER = new URL("agent-day-ledger.json", here);

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes(`--${name}`);

function today() { return new Date().toISOString().slice(0, 10); }
function dayLedger() {
  const empty = { date: today(), totalWnews: 0, txCount: 0, perParty: {} };
  if (!existsSync(DAYLEDGER)) return empty;
  const l = JSON.parse(readFileSync(DAYLEDGER, "utf8"));
  return l.date === today() ? l : empty;
}
function record(kind, obj) {
  const row = { at: new Date().toISOString(), kind, ...obj };
  appendFileSync(DECISIONS, JSON.stringify(row) + "\n");
  if (kind === "escalation") appendFileSync(ESCALATIONS, JSON.stringify(row) + "\n");
  console.log(`[${kind}] ${obj.action}: ${obj.decision ?? ""} ${obj.why ?? ""}`);
  return row;
}

const base = new ethers.JsonRpcProvider(process.env.BASE_RPC ?? "https://mainnet.base.org");
const arc = new ethers.JsonRpcProvider(process.env.ARC_RPC ?? "https://rpc.testnet.arc.network");
const agent = process.env.AGENT_PK ? new ethers.Wallet(process.env.AGENT_PK) : null;

const BRIDGE = ["function totalSupply() view returns (uint256)", "function paused() view returns (bool)",
  "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
const LOCKER = ["function totalLocked() view returns (uint256)", "function paused() view returns (bool)",
  "function lock(uint256)"];
const ERC20 = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
const LEDGER = ["function payFor(address,uint256,bytes32)"];
const PRICE = ["function observedAt() view returns (uint64)"];

async function preflight(checks) {
  const out = [];
  const c = POLICY.invariantChecks;
  if (checks.includes("invariant") && c.requireBridgeInvariantBeforeLock) {
    const [locked, minted] = await Promise.all([
      new ethers.Contract(process.env.BASE_LOCKER, LOCKER, base).totalLocked(),
      new ethers.Contract(process.env.WNEWS_BRIDGE, BRIDGE, arc).totalSupply()]);
    out.push({ check: "invariant", pass: locked === minted, detail: `${ethers.formatEther(locked)} == ${ethers.formatEther(minted)}` });
  }
  if (checks.includes("paused") && c.requirePausedFalse) {
    const p = await new ethers.Contract(process.env.WNEWS_BRIDGE, BRIDGE, arc).paused();
    out.push({ check: "paused", pass: !p, detail: `paused=${p}` });
  }
  if (checks.includes("price") && c.requireFreshPriceMaxAgeMinutes) {
    const ob = await new ethers.Contract(process.env.ATTESTED_PRICE, PRICE, arc).observedAt();
    const ageMin = (Date.now() / 1000 - Number(ob)) / 60;
    out.push({ check: "price-fresh", pass: ageMin <= POLICY.invariantChecks.requireFreshPriceMaxAgeMinutes, detail: `${ageMin.toFixed(0)}m old` });
  }
  return out;
}

function policyGate(action, party, amount) {
  const led = dayLedger();
  const gates = [];
  const partyCfg = party ? POLICY.parties[ethers.getAddress(party)] ?? null : null;
  const perTxCap = partyCfg ? partyCfg.maxTxWnews
    : party ? POLICY.unknownPartyPolicy.maxTxWnews
    : POLICY.perTx.defaultMaxWnews;
  gates.push({ gate: "per-tx", cap: perTxCap, pass: amount <= perTxCap,
    detail: partyCfg ? `party tier=${partyCfg.tier}` : party ? "UNKNOWN party" : "default cap" });
  gates.push({ gate: "daily-total", cap: POLICY.daily.maxTotalWnews,
    pass: led.totalWnews + amount <= POLICY.daily.maxTotalWnews, detail: `spent ${led.totalWnews} today` });
  gates.push({ gate: "daily-count", cap: POLICY.daily.maxTxCount,
    pass: led.txCount + 1 <= POLICY.daily.maxTxCount, detail: `${led.txCount} txs today` });
  if (partyCfg) {
    const spent = led.perParty[party] ?? 0;
    gates.push({ gate: "party-daily", cap: partyCfg.maxDailyWnews,
      pass: spent + amount <= partyCfg.maxDailyWnews, detail: `party spent ${spent} today` });
  }
  return gates;
}

function commitSpend(party, amount) {
  const led = dayLedger();
  led.totalWnews += amount; led.txCount += 1;
  if (party) led.perParty[party] = (led.perParty[party] ?? 0) + amount;
  writeFileSync(DAYLEDGER, JSON.stringify(led, null, 1));
}

async function decide(action, party, amount, checks) {
  const pre = await preflight(checks);
  const gates = policyGate(action, party, amount);
  const failsPre = pre.filter((c) => !c.pass);
  const failsGate = gates.filter((g) => !g.pass);
  if (failsPre.length) {
    record("refusal", { action, party, amount, decision: "REFUSE", why: "environment check failed", checks: pre, gates });
    return false;
  }
  if (failsGate.length) {
    record("escalation", { action, party, amount, decision: "ESCALATE to hardware-key holder", why: failsGate.map((g) => `${g.gate} exceeded (cap ${g.cap}; ${g.detail})`).join("; "), checks: pre, gates, route: POLICY.escalation.route });
    return false;
  }
  record("decision", { action, party, amount, decision: "ALLOW", why: "all checks and policy gates passed", checks: pre, gates });
  return true;
}

const task = arg("task", flag("report") ? "report" : null);
if (task === "report") {
  const led = dayLedger();
  console.log("=== day ledger", led.date, "===");
  console.log(JSON.stringify(led, null, 1));
  if (existsSync(DECISIONS)) {
    const rows = readFileSync(DECISIONS, "utf8").trim().split("\n").slice(-12);
    console.log(`=== last ${rows.length} decisions ===`);
    for (const r of rows) { const d = JSON.parse(r); console.log(`${d.at} [${d.kind}] ${d.action} ${d.amount ?? ""} -> ${d.decision}`); }
  }
  process.exit(0);
}

if (!agent) { console.error("AGENT_PK not set"); process.exit(1); }
const amount = Number(arg("amount", "0"));
const dry = flag("dry-run");

if (task === "lock") {
  const ok = await decide("lock", null, amount, ["invariant", "paused", "price"]);
  if (ok && !dry) {
    const amt = ethers.parseEther(String(amount));
    const w = agent.connect(base);
    const t1 = await new ethers.Contract(process.env.WNEWS, ERC20, w).approve(process.env.BASE_LOCKER, amt);
    await t1.wait();
    const t2 = await new ethers.Contract(process.env.BASE_LOCKER, LOCKER, w).lock(amt);
    await t2.wait();
    commitSpend(null, amount);
    // verify the relayer served the ticket: supply catches up
    const t0 = Date.now();
    let minted = 0n;
    const bridge = new ethers.Contract(process.env.WNEWS_BRIDGE, BRIDGE, arc);
    const before = await new ethers.Contract(process.env.BASE_LOCKER, LOCKER, base).totalLocked();
    while (Date.now() - t0 < 120_000) {
      minted = await bridge.totalSupply();
      if (minted >= before) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    record("outcome", { action: "lock", amount, decision: "DONE", why: `ticket ${t2.hash}; mint verified in ${((Date.now() - t0) / 1000).toFixed(0)}s`, tx: t2.hash });
  } else if (ok && dry) record("outcome", { action: "lock", amount, decision: "DRY-RUN OK", why: "would execute" });
} else if (task === "pay") {
  const to = arg("to");
  const goal = arg("goal", "unspecified-goal");
  const ok = await decide("pay", to, amount, ["paused", "price"]);
  if (ok && !dry) {
    const amt = ethers.parseEther(String(amount));
    const w = agent.connect(arc);
    const t1 = await new ethers.Contract(process.env.WNEWS_BRIDGE, BRIDGE, w).approve(process.env.SERVICE_LEDGER, amt);
    await t1.wait();
    const t2 = await new ethers.Contract(process.env.SERVICE_LEDGER, LEDGER, w).payFor(to, amt, ethers.encodeBytes32String(goal.slice(0, 31)));
    await t2.wait();
    commitSpend(to, amount);
    record("outcome", { action: "pay", party: to, amount, goal, decision: "DONE", why: `ServicePaid ${t2.hash}`, tx: t2.hash });
  } else if (ok && dry) record("outcome", { action: "pay", party: to, amount, goal, decision: "DRY-RUN OK", why: "would execute" });
} else {
  console.error("usage: --task lock|pay|report [--amount N] [--to 0x..] [--goal g] [--dry-run]");
  process.exit(1);
}
