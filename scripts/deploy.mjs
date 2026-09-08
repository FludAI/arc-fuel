// deploy.mjs — deploys the bridge pair + price consumer.
//
//   Base:  BaseLocker(wnews, admin, relayer)
//   Arc:   WNewsBridge(admin, relayer)
//          AttestedPrice(signer)
//
// The DEPLOYER key holds no post-deploy power: admin is a constructor
// argument (the hardware-backed Ledger address), and the relayer/signer
// are data-plane keys. Deploy from any funded throwaway key.
//
// Usage:
//   node deploy.mjs base       deploy BaseLocker on Base
//   node deploy.mjs arc        deploy WNewsBridge + AttestedPrice on Arc
//
// Env (.env in this directory — see .env.example):
//   DEPLOYER_PK, ADMIN, RELAYER, SIGNER, BASE_RPC, ARC_RPC, WNEWS

import { ethers } from "ethers";

import { readFileSync, existsSync } from "node:fs";

// load .env
if (existsSync(new URL("./.env", import.meta.url))) {
  for (const line of readFileSync(new URL("./.env", import.meta.url), "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const target = process.argv[2];
if (!["base", "arc"].includes(target)) {
  console.error("usage: node deploy.mjs base|arc");
  process.exit(1);
}
const need = ["DEPLOYER_PK", "ADMIN", "RELAYER", target === "base" ? "WNEWS" : "SIGNER"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("missing env:", missing.join(", "));
  process.exit(1);
}

// artifacts come from the README's compile command, run from the repo root:
//   npx solc --bin --abi --optimize -o build-deploy contracts/*.sol
if (!existsSync(new URL("../build-deploy/contracts_WNewsBridge_sol_WNewsBridge.bin", import.meta.url))) {
  console.error("no artifacts — run from repo root first:\n  npx solc --bin --abi --optimize -o build-deploy contracts/AttestedPrice.sol contracts/WNewsBridge.sol contracts/BaseLocker.sol");
  process.exit(1);
}
const art = (name) => ({
  bytecode: "0x" + readFileSync(new URL(`../build-deploy/contracts_${name}_sol_${name}.bin`, import.meta.url), "utf8").trim(),
  abi: JSON.parse(readFileSync(new URL(`../build-deploy/contracts_${name}_sol_${name}.abi`, import.meta.url), "utf8")),
});

const rpc = target === "base" ? (process.env.BASE_RPC ?? "https://mainnet.base.org") : process.env.ARC_RPC;
if (!rpc) { console.error("ARC_RPC required"); process.exit(1); }
const provider = new ethers.JsonRpcProvider(rpc);
const wallet = new ethers.Wallet(process.env.DEPLOYER_PK, provider);
const net = await provider.getNetwork();
console.log(`deployer ${wallet.address} on chainId ${net.chainId} (${rpc})`);
console.log(`admin (hardware-backed): ${process.env.ADMIN}`);

async function deploy(name, args) {
  const { abi, bytecode } = art(name);
  const f = new ethers.ContractFactory(abi, bytecode, wallet);
  const c = await f.deploy(...args);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`${name}: ${addr}  (tx ${c.deploymentTransaction().hash})`);
  return addr;
}

if (target === "base") {
  await deploy("BaseLocker", [process.env.WNEWS, process.env.ADMIN, process.env.RELAYER]);
} else {
  await deploy("WNewsBridge", [process.env.ADMIN, process.env.RELAYER]);
  await deploy("AttestedPrice", [process.env.SIGNER]);
}
console.log("done. Record addresses in README + .env, verify source on the explorer.");
