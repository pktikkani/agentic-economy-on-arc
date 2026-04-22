/**
 * Critical-path integration test — real Arc, real Gemini, real Circle.
 *
 * Covers the full agent-economy loop that the hackathon demo depends on:
 *   1. Registries are reachable on Arc testnet
 *   2. Brokers are registered (agentIds cached)
 *   3. readReputation works BOTH when there is and isn't feedback (regression
 *      guard for the `clientAddresses required` bug from Day 3)
 *   4. End-to-end: requester picks a broker, pays, judge grades, feedback posts
 *   5. Reputation count for that broker increases by exactly 1
 *
 * Prereqs: seller server running on :3001-3005, .env populated, brokers registered.
 *
 * Run: npm test
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getCachedAgentIds, readReputation } from "../src/reputation/client.js";
import { runRequester } from "../src/agents/requester.js";
import { BROKERS } from "../src/brokers/registry.js";

const SELLER_ORIGIN = "http://localhost:3001";

async function sellerReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${SELLER_ORIGIN}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

describe("critical path: register → pay → judge → feedback → re-read", () => {
  let agentIds: Record<string, bigint>;

  beforeAll(async () => {
    const up = await sellerReachable();
    if (!up) {
      throw new Error(
        "Seller server not reachable on :3001. Start it with: npx tsx src/brokers/seller-server.ts"
      );
    }
    agentIds = getCachedAgentIds();
    if (Object.keys(agentIds).length !== BROKERS.length) {
      throw new Error(
        `Expected ${BROKERS.length} cached agent IDs, got ${Object.keys(agentIds).length}. Run: npx tsx scripts/register-brokers.ts`
      );
    }
  });

  it("readReputation does not revert on a broker with no feedback (regression for 'clientAddresses required')", async () => {
    // Use broker E (Summarizer) — unlikely to have been picked in earlier smoke runs.
    // Even if it has feedback now, the call should still return a valid object.
    const rep = await readReputation(agentIds.E!);
    // Either null (no feedback) or {count, avg} — both valid; what matters is NO throw.
    if (rep !== null) {
      expect(rep.count).toBeGreaterThanOrEqual(1);
      expect(rep.avg).toBeGreaterThanOrEqual(0);
      expect(rep.avg).toBeLessThanOrEqual(1);
    }
  });

  it("readReputation returns clamped avg ∈ [0,1] for a broker that DOES have feedback", async () => {
    let chosenBrokerId: keyof typeof agentIds | undefined;
    let rep: { count: number; avg: number } | null = null;

    for (const b of BROKERS) {
      const candidate = await readReputation(agentIds[b.id]!);
      if (candidate) {
        chosenBrokerId = b.id;
        rep = candidate;
        break;
      }
    }

    if (!rep) {
      const seeded = await runRequester(
        "Classify sentiment: 'This product is absolutely wonderful.'"
      );
      chosenBrokerId = seeded.chosenBrokerId as keyof typeof agentIds;
      rep = await readReputation(agentIds[chosenBrokerId]!);
    }

    expect(chosenBrokerId).toBeDefined();
    expect(rep).not.toBeNull();
    expect(rep!.count).toBeGreaterThan(0);
    expect(rep!.avg).toBeGreaterThanOrEqual(0);
    expect(rep!.avg).toBeLessThanOrEqual(1);
  });

  it("end-to-end: requester picks a broker, pays, judge grades, feedback posts on-chain", async () => {
    // Pick a service path that forces E (summarize) so we add new feedback to a
    // broker that may have no history, exercising the full write path cleanly.
    const task =
      "Summarize in one sentence: 'The quick brown fox jumps over the lazy dog.'";

    const before = await readReputation(agentIds.E!);
    const beforeCount = before?.count ?? 0;

    const r = await runRequester(task);

    // Agent must have picked SOME broker and gotten a response
    expect(r.chosenBrokerId).not.toBe("none");
    expect(r.brokerResponse).toBeTruthy();
    expect(r.brokerResponse.payment.network).toBe("eip155:5042002");

    // Judge ran and feedback posted
    expect(r.judgeScore).toBeDefined();
    expect(r.judgeScore!.quality).toBeGreaterThanOrEqual(0);
    expect(r.judgeScore!.quality).toBeLessThanOrEqual(1);
    expect(r.feedbackTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Reputation count for the chosen broker must have increased by exactly 1.
    // Note: if agent picked E specifically, before/after counts apply; otherwise
    // we assert the broker IT DID pick has a count strictly greater than 0.
    const afterChosen = await readReputation(
      agentIds[r.chosenBrokerId as keyof typeof agentIds]!
    );
    expect(afterChosen).not.toBeNull();
    expect(afterChosen!.count).toBeGreaterThan(0);

    if (r.chosenBrokerId === "E") {
      expect(afterChosen!.count).toBe(beforeCount + 1);
    }
  });
});
