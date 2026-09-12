// deploy-stake.mjs — deploys EngagementStake (and, on Sepolia, TestWNEWS).
//
//   node deploy-stake.mjs sepolia    TestWNEWS + EngagementStake on Base Sepolia (84532)
//   node deploy-stake.mjs base       EngagementStake on Base (8453) against canonical wNEWS
//
// Env (.env in this directory): DEPLOYER_PK, ADMIN (hardware), TREASURY,
// OPERATOR (data-plane key for stakeFor under caps), BASE_RPC / BASE_SEPOLIA_RPC, WNEWS.
// The DEPLOYER key holds no post-deploy power: admin/treasury/operator are constructor args.
//
// Artifacts: from repo root,
//   npx solc@0.8.26 --bin --abi --optimize -o build-es contracts/EngagementStake.sol contracts/TestWNEWS.sol
import { ethers } from "ethers";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(new URL("./.env", import.meta.url))) {
  for (const line of readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const target = process.argv[2];
if (!["sepolia", "base"].includes(target)) { console.error("usage: node deploy-stake.mjs sepolia|base"); process.exit(1); }
const need = ["DEPLOYER_PK", "ADMIN", "TREASURY", "OPERATOR", ...(target === "base" ? ["WNEWS"] : [])];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("missing env:", missing.join(", ")); process.exit(1); }

const art = (name) => ({
  bytecode: "0x" + readFileSync(new URL(`../build-es/contracts_${name}_sol_${name}.bin`, import.meta.url), "utf8").trim(),
  abi: JSON.parse(readFileSync(new URL(`../build-es/contracts_${name}_sol_${name}.abi`, import.meta.url), "utf8")),
});
const rpc = target === "base" ? (process.env.BASE_RPC ?? "https://mainnet.base.org") : (process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org");
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(process.env.DEPLOYER_PK, provider);
const net = await provider.getNetwork();
const expected = target === "base" ? 8453n : 84532n;
if (net.chainId !== expected) { console.error(`wrong chain: ${net.chainId}, expected ${expected}`); process.exit(1); }
console.log(`deployer ${wallet.address} on chainId ${net.chainId}`);
console.log(`admin (hardware): ${process.env.ADMIN}  treasury: ${process.env.TREASURY}  operator: ${process.env.OPERATOR}`);

async function deploy(name, args) {
  const { abi, bytecode } = art(name);
  const c = await (new ethers.ContractFactory(abi, bytecode, wallet)).deploy(...args);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`${name}: ${addr}  (tx ${c.deploymentTransaction().hash})`);
  return addr;
}

let token = process.env.WNEWS;
if (target === "sepolia") token = await deploy("TestWNEWS", []);
const stake = await deploy("EngagementStake", [token, process.env.ADMIN, process.env.TREASURY, process.env.OPERATOR]);
console.log(`\nrecord:\n  token=${token}\n  ENGAGEMENT_STAKE_${target.toUpperCase()}=${stake}\nverify source on the explorer.`);
