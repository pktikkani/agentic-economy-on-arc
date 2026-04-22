/**
 * Day 2 smoke test: requester agent takes one task, picks a broker via Gemini
 * function calling, pays them, and returns the result.
 *
 * Prereq: seller server must be running (`npx tsx src/brokers/seller-server.ts`)
 *
 * Run: npx tsx scripts/day2-smoke.ts
 */
import { runRequester } from "../src/agents/requester.js";

const TASK = process.argv.slice(2).join(" ") ||
  "Classify the sentiment of this review: 'The new update is fast, but it crashes on startup half the time.'";

async function main() {
  console.log(`TASK: ${TASK}\n`);
  const t0 = Date.now();
  const r = await runRequester(TASK);
  console.log(`\n--- RESULT (${Date.now() - t0}ms) ---`);
  console.log(`Chosen broker: ${r.chosenBrokerId}`);
  console.log(`\nReasoning:\n${r.reasoning}`);
  console.log(`\nBroker response:`, r.brokerResponse);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
