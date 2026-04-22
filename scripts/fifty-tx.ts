/**
 * Hackathon hard-requirement proof: 50 sub-cent on-chain settlements in one session.
 *
 * Uses the SAME broker seller server the full agent demo uses (broker A,
 * FastSent, on :3001). Each hit is a real x402 nanopayment that settles via
 * Circle batching to Arc, using the same Circle-managed buyer wallet path as
 * the main requester. Writes a clean receipt to demo-output/fifty-tx-*.json.
 *
 * Prereq: brokers running. Run: npm run brokers
 *
 * Run: npm run fifty
 */
import { config } from "../src/config.js";
import { ensureGatewayFunded } from "../src/circle/pay.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { circlePay } from "../src/circle/circle-pay.js";
import { getCircleWalletConfig } from "../src/circle/dev-wallet.js";

// GET works universally and sidesteps the SDK's POST-body stripping.
const SELLER_URL = process.env.SELLER_URL ?? "http://localhost:3001/service-fast";
const NUM_TX = Number(process.env.NUM_TX ?? 50);
const EVENT_PREFIX = "@@FIFTY_EVENT@@";

function emitFiftyEvent(event: unknown) {
  if (process.env.FIFTY_EMIT_EVENTS !== "1") return;
  console.log(`${EVENT_PREFIX} ${JSON.stringify(event)}`);
}

async function main() {
  // Top up Gateway so we don't run out mid-flight
  await ensureGatewayFunded(2);
  const { walletAddress } = getCircleWalletConfig();
  emitFiftyEvent({
    type: "run_started",
    total: NUM_TX,
    sellerUrl: SELLER_URL,
    buyer: walletAddress,
    buyerUrl: `${config.arc.explorer}/address/${walletAddress}`,
  });

  console.log(`Firing ${NUM_TX} nanopayments at ${SELLER_URL}...`);
  const started = Date.now();
  type Rec = { i: number; status: number; durMs: number; ok: boolean; note?: string };
  const results: Rec[] = [];

  for (let i = 0; i < NUM_TX; i++) {
    const t = Date.now();
    try {
      // GET — server accepts both, and we don't need a body for the fast
      // proof path. Matches the production agent path which now also uses
      // the URL (query string) to convey payloads.
      const res = await circlePay(SELLER_URL);
      const durMs = Date.now() - t;
      const ok = res.status === 200;
      results.push({ i, status: res.status, durMs, ok });
      console.log(`[${i + 1}/${NUM_TX}] status=${res.status} (${durMs}ms)`);
      emitFiftyEvent({
        type: "tx_progress",
        index: i + 1,
        total: NUM_TX,
        status: res.status,
        durMs,
        ok,
      });
    } catch (e: any) {
      results.push({ i, status: 0, durMs: Date.now() - t, ok: false, note: e.message });
      console.error(`[${i + 1}/${NUM_TX}] FAILED: ${e.message}`);
      emitFiftyEvent({
        type: "tx_progress",
        index: i + 1,
        total: NUM_TX,
        status: 0,
        durMs: Date.now() - t,
        ok: false,
        note: e.message,
      });
    }
  }

  const totalMs = Date.now() - started;
  const okCount = results.filter((r) => r.ok).length;
  const avg = Math.round(
    results.filter((r) => r.ok).reduce((s, r) => s + r.durMs, 0) / Math.max(1, okCount)
  );

  const summary = {
    requirement: "50+ on-chain tx proof",
    seller: SELLER_URL,
    chainId: config.arc.chainId,
    explorerBase: `${config.arc.explorer}/address`,
    buyer: walletAddress,
    nTx: NUM_TX,
    okCount,
    totalWallMs: totalMs,
    avgLatencyMs: avg,
    pricePerTxUsd: 0.003,
    totalUsdcSpent: okCount * 0.003,
    ts: new Date().toISOString(),
  };

  fs.mkdirSync("demo-output", { recursive: true });
  const outfile = path.join("demo-output", `fifty-tx-${Date.now()}.json`);
  fs.writeFileSync(outfile, JSON.stringify({ summary, results }, null, 2));
  emitFiftyEvent({
    type: "run_summary",
    okCount,
    total: NUM_TX,
    totalWallMs: totalMs,
    avgLatencyMs: avg,
    totalUsdcSpent: summary.totalUsdcSpent,
    buyer: summary.buyer,
    buyerUrl: `${config.arc.explorer}/address/${summary.buyer}`,
    receipt: outfile,
  });

  console.log("\n" + "=".repeat(80));
  console.log(`50-TX PROOF: ${okCount}/${NUM_TX} ok in ${(totalMs / 1000).toFixed(1)}s`);
  console.log("=".repeat(80));
  console.log(`Buyer:           ${summary.buyer}`);
  console.log(`Buyer on Arc:    ${config.arc.explorer}/address/${summary.buyer}`);
  console.log(`Avg latency:     ${avg}ms per tx`);
  console.log(`Total USDC:      $${summary.totalUsdcSpent.toFixed(3)}`);
  console.log(`Receipt:         ${outfile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
