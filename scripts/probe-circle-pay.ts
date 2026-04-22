/**
 * Path 2 — Checkpoint 4: make ONE paid request through Circle-signed x402.
 * If this works, the agent system can migrate to the Circle-managed buyer
 * and every tx will appear in console.circle.com/wallets/dev.
 *
 * Prereq: brokers running on :3001. The seller is unchanged — it still
 * expects standard x402 auth. Only the client's signer changed.
 *
 * Run: npx tsx scripts/probe-circle-pay.ts
 */
import { circlePay } from "../src/circle/circle-pay.js";

async function main() {
  console.log("Paying broker A's /service-fast via Circle-signed x402...");
  const t0 = Date.now();
  const { status, data } = await circlePay("http://localhost:3001/service-fast");
  const ms = Date.now() - t0;
  console.log(`status: ${status}  wall: ${ms}ms`);
  console.log(`data: ${JSON.stringify(data).slice(0, 300)}`);
  console.log("\n✅ Path 2 end-to-end works. Every future tx will show in Console.");
}

main().catch((e) => {
  console.error("\n❌ Circle-signed paid request failed.");
  console.error(e);
  process.exit(1);
});
