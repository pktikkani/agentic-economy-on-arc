import fs from "node:fs/promises";
import path from "node:path";

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

import { BROKERS, brokerById, brokerServiceUrl, config, DEMO_TASKS, type BrokerId } from "./config";
import { ensureGatewayFunded, payBroker, circlePay } from "./circle";
import { getBrokerAgentIds, giveFeedback, readReputation } from "./reputation";

const model = google(config.geminiModel);
const explorer = config.arc.explorer;

const taskProfileSchema = z.object({
  service: z.enum(["sentiment", "price-lookup", "summarize"]),
  complexity: z.enum(["low", "medium", "high"]),
  normalizedInput: z.string(),
  reason: z.string(),
});

const brokerAssessmentSchema = z.object({
  brokerId: z.enum(["A", "B", "C", "D", "E"]),
  brokerName: z.string(),
  service: z.enum(["sentiment", "price-lookup", "summarize"]),
  fitScore: z.number().min(0).max(1),
  reason: z.string(),
});

const brokerDecisionSchema = z.object({
  brokerId: z.enum(["A", "B", "C", "D", "E"]),
  reason: z.string(),
});

const judgeSchema = z.object({
  quality: z.number().min(0).max(1),
  reason: z.string(),
});

type DemoEvent =
  | { type: "run_started"; totalTasks: number; model: string; chainId: number; explorer: string }
  | { type: "task_started"; index: number; total: number; task: string }
  | {
      type: "requester_snapshot";
      brokers: Array<{
        id: BrokerId;
        name: string;
        service: string;
        price: string;
        reputation: { count: number; avg: number } | null;
      }>;
    }
  | { type: "a2a_assessment_started"; service: string; complexity: string; count: number }
  | { type: "a2a_assessment_results"; assessments: Array<z.infer<typeof brokerAssessmentSchema>> }
  | { type: "a2a_decision"; brokerId: BrokerId; brokerName: string; reason: string }
  | { type: "broker_selected"; brokerId: BrokerId; brokerName: string; service: string; input: string }
  | {
      type: "broker_response";
      brokerId: BrokerId;
      brokerName: string;
      service: string;
      payer: string;
      amount: string;
      network: string;
      outputPreview: string;
    }
  | { type: "judge_score"; brokerId: BrokerId; quality: number; reason: string }
  | { type: "feedback_written"; brokerId: BrokerId; txHash: string; quality: number }
  | {
      type: "task_completed";
      index: number;
      total: number;
      brokerId: BrokerId;
      priceUsd: number;
      judgeScore: number;
      latencyMs: number;
    }
  | {
      type: "run_summary";
      completed: number;
      total: number;
      totalUsdcSpent: number;
      avgLatencyMs: number;
      picks: Partial<Record<BrokerId, number>>;
      receipt?: string;
    }
  | {
      type: "fifty_started";
      total: number;
      sellerUrl: string;
      buyer: string;
      buyerUrl: string;
    }
  | {
      type: "tx_progress";
      index: number;
      total: number;
      status: number;
      durMs: number;
      ok: boolean;
      note?: string;
    }
  | {
      type: "fifty_summary";
      okCount: number;
      total: number;
      totalWallMs: number;
      avgLatencyMs: number;
      totalUsdcSpent: number;
      buyer: string;
      buyerUrl: string;
      receipt?: string;
    };

async function classifyTask(task: string) {
  const { object } = await generateObject({
    model,
    schema: taskProfileSchema,
    system:
      "Classify the incoming task. Return service as one of sentiment, price-lookup, summarize. Return complexity as one of low, medium, high. normalizedInput should be the exact payload that should be sent to the broker.",
    prompt: task,
  });
  return object;
}

async function assessBroker(task: string, brokerId: BrokerId, input: string, complexity: string) {
  const broker = brokerById(brokerId);
  const { object } = await generateObject({
    model,
    schema: brokerAssessmentSchema,
    system: `You are broker ${broker.id} named ${broker.name}. Your service is ${broker.service}. Your price is ${broker.price}. Your quality tier is ${broker.quality} on a 0 to 1 scale. You do not perform the paid task here. You only assess whether you are a good fit. If the requested service does not match your service, return fitScore=0. If it matches, rate your suitability from 0 to 1 and explain briefly.`,
    prompt: `Task: ${task}\nComplexity: ${complexity}\nNormalized input: ${input}`,
  });
  return object;
}

async function chooseBroker(task: string, service: string, complexity: string, assessments: unknown, reputations: unknown) {
  const { object } = await generateObject({
    model,
    schema: brokerDecisionSchema,
    system:
      "Choose exactly one broker. Prefer matching service first, then stronger reputation and fitScore. When quality looks close, prefer the cheaper broker. Return brokerId and one short reason.",
    prompt: `Task: ${task}\nService: ${service}\nComplexity: ${complexity}\nCandidates:\n${JSON.stringify(
      assessments,
      null,
      2
    )}\nCurrent reputations:\n${JSON.stringify(reputations, null, 2)}`,
  });
  return object;
}

async function judgeOutput(task: string, service: string, output: string) {
  const { object } = await generateObject({
    model,
    schema: judgeSchema,
    system:
      "You are an objective judge evaluating an AI service output quality. Score from 0 to 1. Consider correctness, relevance, and JSON shape if expected.",
    prompt: `Service type: ${service}\nTask: ${task}\nBroker output: ${output}`,
  });
  return object;
}

async function writeReceipt(filename: string, payload: unknown) {
  const dir = path.resolve(process.cwd(), "../demo-output");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, filename);
  await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

function pickTasks(tasksCount: number) {
  const count = Math.max(1, Math.floor(Number.isFinite(tasksCount) ? tasksCount : 1));
  return Array.from({ length: count }, (_, index) => DEMO_TASKS[index % DEMO_TASKS.length]);
}

export async function* runA2ADemo(tasksCount = 1): AsyncGenerator<DemoEvent> {
  const tasks = pickTasks(tasksCount);
  const agentIds = getBrokerAgentIds();
  if (!agentIds.A || !agentIds.B || !agentIds.C || !agentIds.D || !agentIds.E) {
    throw new Error("Missing broker agent ids. Populate BROKER_AGENT_ID_* env vars or ../.cache/broker-ids.json first.");
  }

  await ensureGatewayFunded(1);

  yield {
    type: "run_started",
    totalTasks: tasks.length,
    model: config.geminiModel,
    chainId: config.arc.chainId,
    explorer,
  };

  const startedAt = Date.now();
  let completed = 0;
  let totalSpent = 0;
  const latencies: number[] = [];
  const picks: Partial<Record<BrokerId, number>> = {};

  for (const [index, task] of tasks.entries()) {
    const taskStarted = Date.now();
    yield { type: "task_started", index: index + 1, total: tasks.length, task };

    const profile = await classifyTask(task);
    const brokerState = await Promise.all(
      BROKERS.map(async (broker) => ({
        ...broker,
        reputation: await readReputation(agentIds[broker.id]!),
      }))
    );

    yield {
      type: "requester_snapshot",
      brokers: brokerState.map((broker) => ({
        id: broker.id,
        name: broker.name,
        service: broker.service,
        price: broker.price,
        reputation: broker.reputation,
      })),
    };

    const matching = brokerState.filter((broker) => broker.service === profile.service);
    yield {
      type: "a2a_assessment_started",
      service: profile.service,
      complexity: profile.complexity,
      count: matching.length,
    };

    const assessments = await Promise.all(
      matching.map((broker) => assessBroker(task, broker.id, profile.normalizedInput, profile.complexity))
    );
    yield { type: "a2a_assessment_results", assessments };

    const choice = await chooseBroker(
      task,
      profile.service,
      profile.complexity,
      assessments,
      matching.map((broker) => ({ id: broker.id, reputation: broker.reputation, price: broker.price }))
    );
    const chosen = brokerById(choice.brokerId);
    yield { type: "a2a_decision", brokerId: chosen.id, brokerName: chosen.name, reason: choice.reason };
    yield {
      type: "broker_selected",
      brokerId: chosen.id,
      brokerName: chosen.name,
      service: chosen.service,
      input: profile.normalizedInput,
    };

    const paid = await payBroker<{
      broker_id: string;
      broker_name: string;
      service: string;
      result: { output: string };
      payment: { payer: string; amount: string; network: string };
    }>(brokerServiceUrl(chosen, "/service"), { input: profile.normalizedInput });

    yield {
      type: "broker_response",
      brokerId: chosen.id,
      brokerName: chosen.name,
      service: chosen.service,
      payer: paid.data.payment.payer,
      amount: paid.data.payment.amount,
      network: paid.data.payment.network,
      outputPreview: String(paid.data.result.output).slice(0, 220),
    };

    const judged = await judgeOutput(task, chosen.service, paid.data.result.output);
    yield { type: "judge_score", brokerId: chosen.id, quality: judged.quality, reason: judged.reason };

    const feedbackTx = await giveFeedback(agentIds[chosen.id]!, judged.quality);
    yield { type: "feedback_written", brokerId: chosen.id, txHash: feedbackTx, quality: judged.quality };

    const latencyMs = Date.now() - taskStarted;
    const priceUsd = Number(chosen.price.replace("$", ""));
    completed += 1;
    totalSpent += priceUsd;
    latencies.push(latencyMs);
    picks[chosen.id] = (picks[chosen.id] ?? 0) + 1;

    yield {
      type: "task_completed",
      index: index + 1,
      total: tasks.length,
      brokerId: chosen.id,
      priceUsd,
      judgeScore: judged.quality,
      latencyMs,
    };
  }

  const receipt = await writeReceipt(`web-demo-${Date.now()}.json`, {
    summary: {
      completed,
      total: tasks.length,
      totalUsdcSpent: totalSpent,
      avgLatencyMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)),
      picks,
      totalWallMs: Date.now() - startedAt,
    },
  });

  yield {
    type: "run_summary",
    completed,
    total: tasks.length,
    totalUsdcSpent: totalSpent,
    avgLatencyMs: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)),
    picks,
    receipt,
  };
}

export async function* runA2AFifty(total = 50): AsyncGenerator<DemoEvent> {
  const count = Math.max(1, Math.min(total, 200));
  await ensureGatewayFunded(1);

  const buyer = config.circle.walletAddress;
  const sellerUrl = brokerServiceUrl(brokerById("A"), "/service-fast");
  yield {
    type: "fifty_started",
    total: count,
    sellerUrl,
    buyer,
    buyerUrl: `${explorer}/address/${buyer}`,
  };

  const startedAt = Date.now();
  const results: Array<{ status: number; durMs: number; ok: boolean; note?: string }> = [];
  for (let index = 1; index <= count; index += 1) {
    const txStarted = Date.now();
    try {
      const paid = await circlePay<unknown>(sellerUrl);
      const result = {
        status: paid.status,
        durMs: Date.now() - txStarted,
        ok: paid.status === 200,
      };
      results.push(result);
      yield { type: "tx_progress", index, total: count, ...result };
    } catch (error) {
      const result = {
        status: 0,
        durMs: Date.now() - txStarted,
        ok: false,
        note: error instanceof Error ? error.message : "Unknown payment error",
      };
      results.push(result);
      yield { type: "tx_progress", index, total: count, ...result };
    }
  }

  const okCount = results.filter((entry) => entry.ok).length;
  const avgLatencyMs = Math.round(
    results.filter((entry) => entry.ok).reduce((sum, entry) => sum + entry.durMs, 0) / Math.max(1, okCount)
  );
  const totalUsdcSpent = okCount * Number(brokerById("A").price.replace("$", ""));
  const receipt = await writeReceipt(`web-fifty-${Date.now()}.json`, {
    summary: {
      okCount,
      total: count,
      totalWallMs: Date.now() - startedAt,
      avgLatencyMs,
      totalUsdcSpent,
      buyer,
    },
    results,
  });

  yield {
    type: "fifty_summary",
    okCount,
    total: count,
    totalWallMs: Date.now() - startedAt,
    avgLatencyMs,
    totalUsdcSpent,
    buyer,
    buyerUrl: `${explorer}/address/${buyer}`,
    receipt,
  };
}
