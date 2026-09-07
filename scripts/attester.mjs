// attester.mjs — signs price prints from the canonical Base pool for Arc.
//
// Reads slot0 from the canonical wNEWS/USDC Uniswap v3 pool on Base,
// converts to USDC-per-wNEWS at 6 decimals, signs the AttestedPrice
// digest, and posts it to Arc. The signer is a DATA key — it can make a
// print valid, never move funds.
//
// Usage:
//   node attester.mjs --dry-run      read slot0, compute + sign, print, don't send
//   node attester.mjs                post one print to Arc
//   node attester.mjs --loop 3600    post hourly
//
// Env (.env in this directory or exported):
//   BASE_RPC        default https://mainnet.base.org
//   ARC_RPC         required to post (Circle Arc RPC)
//   ATTESTED_PRICE  AttestedPrice contract address on Arc (post-deploy)
//   SIGNER_PK       price-signer private key (data-plane; Key Ring later)

import { ethers } from "ethers";

const POOL = "0x2dd7792966535333bae2f063bdf179f1bed220a4";
const POOL_ABI = ["function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"];
const ATTESTED_ABI = ["function post(uint256 newPrice, uint64 newObserved, uint8 v, bytes32 r, bytes32 s)"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const loopIdx = args.indexOf("--loop");
const loopSecs = loopIdx >= 0 ? parseInt(args[loopIdx + 1], 10) : 0;

const BASE_RPC = process.env.BASE_RPC ?? "https://mainnet.base.org";

// spot (USDC per wNEWS, 6-decimal fixed) = 1e18 * 2^192 / sqrtPriceX96^2
// (token0 = USDC 6d, token1 = wNEWS 18d — verified on-chain; the 1e18
// combines the 1e12 decimal bridge with the 1e6 output scale.)
function priceE6(sqrtPriceX96) {
  const sq = sqrtPriceX96 * sqrtPriceX96;
  return (10n ** 18n * 2n ** 192n) / sq;
}

async function makePrint(signer, attestedAddr, arcChainId) {
  const base = new ethers.JsonRpcProvider(BASE_RPC);
  const pool = new ethers.Contract(POOL, POOL_ABI, base);
  const [{ sqrtPriceX96 }, block] = await Promise.all([
    pool.slot0(),
    base.getBlock("latest"),
  ]);
  const price = priceE6(sqrtPriceX96);
  const observedAt = BigInt(block.timestamp);

  // digest must match AttestedPrice.post: keccak256(abi.encode(
  //   attestedPriceAddress, arcChainId, price, observedAt)) under EIP-191.
  const inner = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "uint256", "uint64"],
      [attestedAddr, arcChainId, price, observedAt]
    )
  );
  const sig = ethers.Signature.from(await signer.signMessage(ethers.getBytes(inner)));
  return { price, observedAt, sig, human: Number(price) / 1e6 };
}

async function once() {
  const signer = new ethers.Wallet(
    process.env.SIGNER_PK ?? ethers.Wallet.createRandom().privateKey
  );
  const attestedAddr = process.env.ATTESTED_PRICE ?? ethers.ZeroAddress;

  if (dryRun) {
    const p = await makePrint(signer, attestedAddr, 0n);
    console.log(
      `[dry-run] spot=${p.human} USDC/wNEWS  price_e6=${p.price}  observedAt=${p.observedAt}  signer=${signer.address}  sig=${p.sig.compactSerialized.slice(0, 20)}…`
    );
    return;
  }

  if (!process.env.ARC_RPC || !process.env.ATTESTED_PRICE || !process.env.SIGNER_PK) {
    throw new Error("ARC_RPC, ATTESTED_PRICE and SIGNER_PK are required to post");
  }
  const arc = new ethers.JsonRpcProvider(process.env.ARC_RPC);
  const { chainId } = await arc.getNetwork();
  const p = await makePrint(signer, attestedAddr, chainId);
  const attested = new ethers.Contract(attestedAddr, ATTESTED_ABI, signer.connect(arc));
  const tx = await attested.post(p.price, p.observedAt, p.sig.v, p.sig.r, p.sig.s);
  console.log(`posted ${p.human} USDC/wNEWS observedAt=${p.observedAt} tx=${tx.hash}`);
  await tx.wait();
}

if (loopSecs > 0) {
  for (;;) {
    try {
      await once();
    } catch (e) {
      console.error("attest failed:", e.message ?? e);
    }
    await new Promise((r) => setTimeout(r, loopSecs * 1000));
  }
} else {
  await once();
}
