/**
 * Day 3 smoke test: full flow with reputation.
 *   1. requester reads on-chain reputation for all 5 brokers
 *   2. picks the best fit, pays via x402
 *   3. Gemini judge grades the output
 *   4. Requester posts feedback on-chain via giveFeedback()
 *
 * Prereq: seller server running + brokers registered.
 *
 * Run: npx tsx scripts/day3-smoke.ts [task...]
 */
import { runRequester } from "../src/agents/requester.js";
import { config } from "../src/config.js";

const TASK = process.argv.slice(2).join(" ") ||
  "What's the current USD price of SOL?";

async function main() {
  console.log(`TASK: ${TASK}\n`);
  const t0 = Date.now();
  const r = await runRequester(TASK);
  const dur = Date.now() - t0;

  console.log(`\n--- RESULT (${dur}ms) ---`);
  console.log(`Chosen broker: ${r.chosenBrokerId}`);
  console.log(`\nReputation seen by agent (pre-tx):`);
  for (const [id, rep] of Object.entries(r.reputationBefore)) {
    console.log(`  ${id}: ${rep ? `count=${rep.count} avg=${rep.avg.toFixed(2)}` : "no feedback yet"}`);
  }
  console.log(`\nAgent reasoning:\n${r.reasoning}`);
  console.log(`\nBroker response:`, r.brokerResponse);
  if (r.judgeScore) {
    console.log(`\nJudge: ${r.judgeScore.quality.toFixed(2)} — ${r.judgeScore.reason}`);
  }
  if (r.feedbackTxHash) {
    console.log(`Reputation tx: ${config.arc.explorer}/tx/${r.feedbackTxHash}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
