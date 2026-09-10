// relayer.mjs — the bridge's data plane. Two watches, one loop:
//
//   Base  Locked(sender, arcRecipient, amount)   → Arc  bridgeIn(arcRecipient, amount, lockTxHash)
//   Arc   BridgedOut(from, amount, baseRecipient) → Base release(baseRecipient, amount, burnTxHash)
//
// Idempotency lives ON-CHAIN (processed[baseLockTx] / released[arcBurnTx]),
// so this script is deliberately stateless beyond a block checkpoint:
// crashing and replaying the same event is safe — the second attempt
// reverts AlreadyProcessed/AlreadyReleased and is skipped. The relayer
// key is data-plane: it can mint only real lock receipts up to the cap,
// and release only real burns. It can never raise the cap or pause.
//
// Usage:
//   node relayer.mjs --dry-run     connect, list pending events, send nothing
//   node relayer.mjs               process pending, then poll every 30s
//
// Env (.env here or exported):
//   BASE_RPC (default https://mainnet.base.org), ARC_RPC (required)
//   BASE_LOCKER, WNEWS_BRIDGE     contract addresses (post-deploy)
//   RELAYER_PK                    relayer key (data-plane; Key Ring later)
//   START_BLOCK_BASE, START_BLOCK_ARC   first blocks to scan (deploy blocks)

import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "node:fs";

const LOCKER_ABI = [
  "event Locked(address indexed sender, address indexed arcRecipient, uint256 amount)",
  "function release(address to, uint256 amount, bytes32 arcBurnTx)",
  "function released(bytes32) view returns (bool)",
];
const BRIDGE_ABI = [
  "event BridgedOut(address indexed from, uint256 amount, address baseRecipient)",
  "function bridgeIn(address to, uint256 amount, bytes32 baseLockTx)",
  "function processed(bytes32) view returns (bool)",
];

const dryRun = process.argv.includes("--dry-run");
const CHECKPOINT = new URL("./relayer-checkpoint.json", import.meta.url);

function loadCheckpoint() {
  try { return JSON.parse(readFileSync(CHECKPOINT, "utf8")); }
  catch { return { base: Number(process.env.START_BLOCK_BASE ?? 0), arc: Number(process.env.START_BLOCK_ARC ?? 0) }; }
}

// Public RPCs cap eth_getLogs ranges AND rate-limit bursts — query in
// chunks, spaced, with backoff. After the first full scan the checkpoint
// keeps every later tick to a chunk or two.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function chunkedFilter(contract, eventName, from, to, chunk) {
  const out = [];
  for (let a = from; a <= to; a += chunk) {
    const hi = Math.min(a + chunk - 1, to);
    for (let attempt = 1; ; attempt++) {
      try {
        out.push(...await contract.queryFilter(eventName, a, hi));
        break;
      } catch (e) {
        if (attempt >= 5) throw e;
        await sleep(1500 * attempt);
      }
    }
    await sleep(300);
  }
  return out;
}

async function tick(ctx) {
  const cp = loadCheckpoint();
  const [baseHead, arcHead] = await Promise.all([
    ctx.base.getBlockNumber(), ctx.arc.getBlockNumber(),
  ]);

  // Base locks → Arc mints
  const locks = await chunkedFilter(ctx.locker, "Locked", cp.base, baseHead, 1900);
  for (const ev of locks) {
    const ticket = ev.transactionHash;
    if (await ctx.bridge.processed(ticket)) continue;
    const [, arcRecipient, amount] = ev.args;
    console.log(`lock ${ticket.slice(0, 10)}… → mint ${ethers.formatEther(amount)} wNEWS.arc to ${arcRecipient}`);
    if (!dryRun) {
      const tx = await ctx.bridge.connect(ctx.arcSigner).bridgeIn(arcRecipient, amount, ticket);
      await tx.wait();
      console.log(`  minted: ${tx.hash}`);
    }
  }

  // Arc burns → Base releases
  const burns = await chunkedFilter(ctx.bridge, "BridgedOut", cp.arc, arcHead, 9000);
  for (const ev of burns) {
    const ticket = ev.transactionHash;
    if (await ctx.locker.released(ticket)) continue;
    const [, amount, baseRecipient] = ev.args;
    console.log(`burn ${ticket.slice(0, 10)}… → release ${ethers.formatEther(amount)} wNEWS to ${baseRecipient}`);
    if (!dryRun) {
      const tx = await ctx.locker.connect(ctx.baseSigner).release(baseRecipient, amount, ticket);
      await tx.wait();
      console.log(`  released: ${tx.hash}`);
    }
  }

  if (!dryRun) writeFileSync(CHECKPOINT, JSON.stringify({ base: baseHead + 1, arc: arcHead + 1 }));
  return { locks: locks.length, burns: burns.length };
}

const need = ["ARC_RPC", "BASE_LOCKER", "WNEWS_BRIDGE"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`missing env: ${missing.join(", ")} — set after deploy. (--dry-run still needs addresses)`);
  process.exit(1);
}

const base = new ethers.JsonRpcProvider(process.env.BASE_RPC ?? "https://mainnet.base.org");
const arc = new ethers.JsonRpcProvider(process.env.ARC_RPC);
const pk = process.env.RELAYER_PK;
if (!pk && !dryRun) { console.error("RELAYER_PK required unless --dry-run"); process.exit(1); }
const wallet = pk ? new ethers.Wallet(pk) : null;

const ctx = {
  base, arc,
  baseSigner: wallet?.connect(base), arcSigner: wallet?.connect(arc),
  locker: new ethers.Contract(process.env.BASE_LOCKER, LOCKER_ABI, base),
  bridge: new ethers.Contract(process.env.WNEWS_BRIDGE, BRIDGE_ABI, arc),
};

if (dryRun) {
  const r = await tick(ctx);
  console.log(`[dry-run] pending: ${r.locks} lock(s), ${r.burns} burn(s). Nothing sent.`);
} else if (process.argv.includes("--once")) {
  // one reconcile pass and exit — the shape a scheduled runner wants
  const r = await tick(ctx);
  console.log(`tick done: ${r.locks} lock(s), ${r.burns} burn(s) examined.`);
} else {
  console.log("relayer up: Base locks → Arc mints, Arc burns → Base releases (30s poll)");
  for (;;) {
    try { await tick(ctx); }
    catch (e) { console.error("tick failed:", e.message ?? e); }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}
