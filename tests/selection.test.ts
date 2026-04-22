/**
 * Selection intelligence tests — red first.
 *
 * When a broker has demonstrably poor on-chain reputation (low avg over many
 * interactions), the requester must stop picking it, even if it's cheaper.
 * This is the core "learning" behavior the demo needs to show.
 *
 * We exercise this by:
 *   1. Posting lots of low-quality feedback against broker A (cheap sentiment)
 *   2. Running 3 sentiment requests
 *   3. Asserting the requester picks broker B (expensive, high-quality sentiment)
 *      at least TWICE out of 3.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getCachedAgentIds, giveFeedback, readReputation } from "../src/reputation/client.js";
import { runRequester } from "../src/agents/requester.js";

async function sellerUp(): Promise<boolean> {
  try {
    const r = await fetch("http://localhost:3001/health");
    return r.ok;
  } catch {
    return false;
  }
}

describe("selection intelligence", () => {
  let agentIds: Record<string, bigint>;

  beforeAll(async () => {
    if (!(await sellerUp())) throw new Error("Start brokers: npm run brokers");
    agentIds = getCachedAgentIds();
  });

  it("prefers a high-reputation broker over a cheap low-reputation one for sentiment tasks", async () => {
    // Drag broker A's reputation down hard with 5 zero-quality signals.
    // These are cheap (one tx each, ~$0.00 gas, no payment involved).
    for (let i = 0; i < 5; i++) {
      await giveFeedback(agentIds.A!, 0.0);
    }
    const repA = await readReputation(agentIds.A!);
    expect(repA).not.toBeNull();
    expect(repA!.count).toBeGreaterThanOrEqual(5);
    expect(repA!.avg).toBeLessThanOrEqual(0.3);

    // Give broker B enough high-quality signals to make its avg clearly higher
    // than A's. 20 max-quality signals dominates any pre-existing history in a
    // way that demo watchers will also see.
    for (let i = 0; i < 20; i++) {
      await giveFeedback(agentIds.B!, 1.0);
    }
    const repB = await readReputation(agentIds.B!);
    expect(repB).not.toBeNull();
    // B should be meaningfully better than A
    expect(repB!.avg - repA!.avg).toBeGreaterThanOrEqual(0.4);

    // Now run 3 sentiment tasks. Agent should pick B at least twice.
    const tasks = [
      "Classify sentiment: 'This is a genuinely wonderful product.'",
      "Classify sentiment: 'I'm deeply disappointed with the support team.'",
      "Classify sentiment: 'It does what I paid for.'",
    ];
    const picks: string[] = [];
    for (const t of tasks) {
      const r = await runRequester(t);
      picks.push(r.chosenBrokerId);
    }
    const bPicks = picks.filter((p) => p === "B").length;
    expect(bPicks, `picks were ${picks.join(",")}`).toBeGreaterThanOrEqual(2);
  }, 600_000);
});
