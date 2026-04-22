/**
 * RequesterAgent — Gemini (Flash 3 by default) via raw REST function calling.
 *
 * Uses the hand-rolled agent loop in src/circle/gemini-tools.ts instead of
 * the Vercel AI SDK's generateText+tools, because the SDK path consistently
 * spent 60s+ per task while the raw REST path lands in ~3s per model turn.
 * Model selection is empirically justified (see scripts/compare-models.ts):
 * Flash matched Pro's judge quality at 6x the speed.
 *
 * Flow:
 *   1. Pre-read ERC-8004 reputation for all brokers (parallel)
 *   2. Ask Gemini to pick via list_brokers + pay_broker tools
 *   3. After payment, judge the broker's output
 *   4. Post judge score to ReputationRegistry
 */
import { config } from "../config.js";
import { BROKERS, brokerById, brokerUrl } from "../brokers/registry.js";
import { ensureGatewayFunded, payBroker } from "../circle/pay.js";
import { getCachedAgentIds, giveFeedback, readReputation } from "../reputation/client.js";
import { judgeOutput } from "../reputation/judge.js";
import { runAgent, type ToolDef } from "../circle/gemini-tools.js";
import { emitDemoEvent } from "../demo/events.js";

export type RequesterResult = {
  task: string;
  chosenBrokerId: string;
  brokerResponse: any;
  reasoning: string;
  judgeScore?: { quality: number; reason: string };
  feedbackTxHash?: `0x${string}`;
  reputationBefore: Record<string, { count: number; avg: number } | null>;
};

const SYSTEM = `You are a requester agent in an agent-to-agent marketplace on Arc. A user gives you a task; you must pick the best broker from a registry, pay them a USDC nanopayment, and return their result.

Selection rules — follow in order:
1. Match the broker's service type to the task (sentiment, price-lookup, or summarize).
2. Call list_brokers to get current prices and on-chain reputations.
3. Within the matching-service brokers, prefer higher reputation.avg (when count >= 3) — proven quality is worth a higher price.
4. When multiple brokers in the same service have similar quality, pick the cheapest.
5. If ALL matching-service brokers look weak (low reputation) or the history is thin, STILL PICK ONE — the task must be fulfilled. You can note the weakness in your final message.
6. ALWAYS call pay_broker exactly ONCE. Never end the task without paying.`;

export async function runRequester(task: string): Promise<RequesterResult> {
  const timings: Record<string, number> = {};
  const mark = (label: string, from: number) => {
    timings[label] = Date.now() - from;
  };

  const t0 = Date.now();
  await ensureGatewayFunded(1);
  mark("ensureGatewayFunded", t0);

  const agentIds = getCachedAgentIds();
  if (Object.keys(agentIds).length === 0) {
    throw new Error("No broker agentIds cached. Run: npx tsx scripts/register-brokers.ts");
  }

  const tRep = Date.now();
  const repEntries = await Promise.all(
    BROKERS.map(async (b) => [b.id, await readReputation(agentIds[b.id]!)] as const)
  );
  const reps: Record<string, { count: number; avg: number } | null> = {};
  for (const [id, v] of repEntries) reps[id] = v;
  mark("readAllReputations", tRep);
  emitDemoEvent({
    type: "requester_snapshot",
    brokers: BROKERS.map((b) => ({
      id: b.id,
      service: b.service,
      price: b.price,
      reputation: reps[b.id],
    })),
  });

  const chosen: { id?: string; response?: any; brokerStart?: number; brokerEnd?: number } = {};

  const tools: ToolDef[] = [
    {
      name: "list_brokers",
      description:
        "List all available broker agents with service, price, intrinsic quality, and on-chain ERC-8004 reputation.",
      parameters: { type: "object", properties: {} },
      execute: async () =>
        BROKERS.map((b) => ({
          id: b.id,
          name: b.name,
          service: b.service,
          price: b.price,
          intrinsic_quality: b.quality,
          reputation: reps[b.id],
          agent_id: agentIds[b.id]?.toString(),
        })),
    },
    {
      name: "pay_broker",
      description:
        "Pay a broker via USDC nanopayment on Arc and receive their service result. Call exactly once per task.",
      parameters: {
        type: "object",
        properties: {
          broker_id: { type: "string", enum: ["A", "B", "C", "D", "E"] },
          input: { type: "string", description: "The input payload for the broker's service." },
        },
        required: ["broker_id", "input"],
      },
      execute: async ({ broker_id, input }: { broker_id: string; input: string }) => {
        if (process.env.DEMO_DEBUG) {
          console.log(
            `     [requester → broker ${broker_id}] "${String(input).slice(0, 60)}${
              String(input).length > 60 ? "…" : ""
            }"`
          );
        }
        const broker = brokerById(broker_id);
        emitDemoEvent({
          type: "broker_selected",
          brokerId: broker.id,
          brokerName: broker.name,
          service: broker.service,
          input,
        });
        chosen.brokerStart = Date.now();
        const { status, data } = await payBroker(brokerUrl(broker, "/service"), { input });
        chosen.brokerEnd = Date.now();
        chosen.id = broker_id;
        chosen.response = data;
        emitDemoEvent({
          type: "broker_response",
          brokerId: broker.id,
          brokerName: broker.name,
          service: broker.service,
          payer: data?.payment?.payer,
          amount: data?.payment?.amount,
          network: data?.payment?.network,
          outputPreview:
            typeof data?.result?.output === "string"
              ? data.result.output.slice(0, 220)
              : JSON.stringify(data?.result?.output ?? "").slice(0, 220),
        });
        return { status, data };
      },
    },
  ];

  const tGen = Date.now();
  const { finalText } = await runAgent({
    system: SYSTEM,
    prompt: task,
    tools,
    maxSteps: 6,
  });
  mark("requesterLoop", tGen);
  if (chosen.brokerStart && chosen.brokerEnd && timings.requesterLoop !== undefined) {
    timings.brokerCall = chosen.brokerEnd - chosen.brokerStart;
    timings.requesterReasoning = timings.requesterLoop - timings.brokerCall;
  }

  let judgeScore: { quality: number; reason: string } | undefined;
  let feedbackTxHash: `0x${string}` | undefined;

  if (chosen.id && chosen.response?.result?.output) {
    const broker = brokerById(chosen.id);
    try {
      const brokerOutput = chosen.response.result.output;
      if (process.env.DEMO_DEBUG) {
        console.log(`     [judge input] service=${broker.service}`);
        console.log(`     [judge input] output=${JSON.stringify(brokerOutput).slice(0, 200)}`);
      }
      const tJudge = Date.now();
      judgeScore = await judgeOutput(task, broker.service, brokerOutput);
      mark("judge", tJudge);
      emitDemoEvent({
        type: "judge_score",
        brokerId: chosen.id,
        quality: judgeScore.quality,
        reason: judgeScore.reason,
      });
      if (process.env.DEMO_DEBUG) {
        console.log(`     [judge output] quality=${judgeScore.quality} reason=${judgeScore.reason}`);
      }
      const tFb = Date.now();
      feedbackTxHash = await giveFeedback(agentIds[chosen.id]!, judgeScore.quality);
      mark("giveFeedbackTx", tFb);
      emitDemoEvent({
        type: "feedback_written",
        brokerId: chosen.id,
        txHash: feedbackTxHash,
      });
    } catch (e) {
      console.error("Post-interaction reputation step failed:", e);
    }
  }

  if (process.env.DEMO_TIMINGS) {
    console.log(`     [timings] ${JSON.stringify(timings)}`);
  }

  return {
    task,
    chosenBrokerId: chosen.id ?? "none",
    brokerResponse: chosen.response ?? null,
    reasoning: finalText,
    judgeScore,
    feedbackTxHash,
    reputationBefore: reps,
  };
}
