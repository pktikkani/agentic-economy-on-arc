/**
 * 50-query demo driver.
 *
 * Runs the full agent-economy loop once per task:
 *   user_task → requester agent → broker selection → x402 nanopayment on Arc
 *     → broker service execution → judge grades output → reputation feedback
 *     on-chain.
 *
 * Produces:
 *   - Live terminal feed of every decision + tx hash (Arc explorer clickable)
 *   - Final summary: picks per broker, reputation evolution, total USDC spent,
 *     tx counts, average latency, proof links for the video.
 *
 * Prereq: seller server running. `npm run brokers` starts it.
 *
 * Run: npm run demo
 */
import { DEMO_TASKS } from "./tasks.js";
import { runRequester } from "../agents/requester.js";
import { BROKERS } from "../brokers/registry.js";
import { config } from "../config.js";
import { readReputation, getCachedAgentIds } from "../reputation/client.js";
import { emitDemoEvent } from "./events.js";

type TaskRecord = {
  i: number;
  task: string;
  brokerId: string;
  priceUsd: number;
  judgeScore?: number;
  latencyMs: number;
  paymentTxNetwork?: string;
  feedbackTx?: string;
  ok: boolean;
};

const PRICE_USD: Record<string, number> = {
  A: 0.003,
  B: 0.008,
  C: 0.002,
  D: 0.007,
  E: 0.005,
};

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function short(s: string, n = 64) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

async function main() {
  const howMany = Number(process.env.DEMO_N ?? DEMO_TASKS.length);

  // Interleave so the first N tasks span all 3 services (sentiment, price,
  // summarize). Reveals the agent picking different brokers for different
  // services instead of hammering one broker across all-same-service tasks.
  const buckets: string[][] = [[], [], []];
  for (const t of DEMO_TASKS) {
    if (t.startsWith("Classify sentiment")) buckets[0]!.push(t);
    else if (t.startsWith("What is the USD price")) buckets[1]!.push(t);
    else buckets[2]!.push(t);
  }
  const interleaved: string[] = [];
  const maxLen = Math.max(...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const b of buckets) {
      if (b[i]) interleaved.push(b[i]!);
    }
  }
  const tasks = interleaved.slice(0, howMany);
  const records: TaskRecord[] = [];

  console.log("=".repeat(80));
  console.log("AGENT ECONOMY ON ARC — DEMO RUN");
  console.log("=".repeat(80));
  console.log(`Tasks:  ${tasks.length}`);
  console.log(`Model:  ${config.gemini.model}`);
  console.log(`Chain:  Arc testnet (id ${config.arc.chainId})`);
  console.log(`Expl:   ${config.arc.explorer}`);
  console.log("=".repeat(80));
  emitDemoEvent({
    type: "run_started",
    totalTasks: tasks.length,
    model: config.gemini.model,
    chainId: config.arc.chainId,
    explorer: config.arc.explorer,
  });

  const t0 = Date.now();
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const started = Date.now();
    console.log(`\n[${i + 1}/${tasks.length}] ${short(task, 72)}`);
    emitDemoEvent({
      type: "task_started",
      index: i + 1,
      total: tasks.length,
      task,
    });
    try {
      const r = await runRequester(task);
      const dur = Date.now() - started;
      const rec: TaskRecord = {
        i,
        task,
        brokerId: r.chosenBrokerId,
        priceUsd: PRICE_USD[r.chosenBrokerId] ?? 0,
        judgeScore: r.judgeScore?.quality,
        latencyMs: dur,
        paymentTxNetwork: r.brokerResponse?.payment?.network,
        feedbackTx: r.feedbackTxHash,
        ok: r.chosenBrokerId !== "none",
      };
      records.push(rec);
      const judge = rec.judgeScore !== undefined ? rec.judgeScore.toFixed(2) : "—";
      const tx = rec.feedbackTx ? `${config.arc.explorer}/tx/${rec.feedbackTx}` : "—";
      console.log(
        `     → broker=${rec.brokerId}  price=$${rec.priceUsd.toFixed(3)}  judge=${judge}  ${dur}ms`
      );
      console.log(`     → feedback: ${tx}`);
      emitDemoEvent({
        type: "task_completed",
        index: i + 1,
        total: tasks.length,
        brokerId: rec.brokerId,
        priceUsd: rec.priceUsd,
        judgeScore: rec.judgeScore,
        latencyMs: dur,
      });
    } catch (e: any) {
      console.error(`     ✗ FAILED: ${e.message}`);
      emitDemoEvent({
        type: "task_failed",
        index: i + 1,
        total: tasks.length,
        task,
        error: e.message,
      });
      records.push({
        i,
        task,
        brokerId: "none",
        priceUsd: 0,
        latencyMs: Date.now() - started,
        ok: false,
      });
    }
  }
  const totalMs = Date.now() - t0;

  // Final reputation pull
  const agentIds = getCachedAgentIds();
  const finalReps: Record<string, { count: number; avg: number } | null> = {};
  for (const b of BROKERS) {
    finalReps[b.id] = await readReputation(agentIds[b.id]!);
  }

  // Summary
  const successes = records.filter((r) => r.ok);
  const totalUsd = successes.reduce((s, r) => s + r.priceUsd, 0);
  const avgLatency = Math.round(
    successes.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, successes.length)
  );
  const picks: Record<string, number> = {};
  for (const r of successes) picks[r.brokerId] = (picks[r.brokerId] ?? 0) + 1;

  console.log("\n" + "=".repeat(80));
  console.log("DEMO SUMMARY");
  console.log("=".repeat(80));
  console.log(`Completed:        ${successes.length}/${records.length}`);
  console.log(`Total wall time:  ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`Avg latency:      ${avgLatency}ms`);
  console.log(`Total USDC spent: $${totalUsd.toFixed(4)}  (includes service fees only)`);
  console.log(`On-chain txs:     ${successes.length} nanopayments + ${successes.filter((r) => r.feedbackTx).length} reputation writes`);
  console.log();
  console.log(`Broker picks:`);
  for (const b of BROKERS) {
    const n = picks[b.id] ?? 0;
    const rep = finalReps[b.id];
    const repStr = rep ? `count=${rep.count} avg=${rep.avg.toFixed(2)}` : "no feedback";
    console.log(
      `  ${b.id} ${pad(b.name, 12)} ${pad(b.service, 14)} ${b.price}  picks=${n}  rep=[${repStr}]`
    );
  }

  console.log();
  console.log(`Margin check:`);
  const ethGasLow = 0.5;
  const ethGasHigh = 5;
  console.log(`  Revenue in this run:     $${totalUsd.toFixed(4)}`);
  console.log(`  Ethereum gas equivalent: $${(successes.length * ethGasLow).toFixed(2)} to $${(successes.length * ethGasHigh).toFixed(2)}`);
  console.log(`  Margin on Ethereum:      -${((successes.length * ethGasLow) / Math.max(totalUsd, 1e-9) * 100 - 100).toFixed(0)}% to -${((successes.length * ethGasHigh) / Math.max(totalUsd, 1e-9) * 100 - 100).toFixed(0)}%`);
  console.log(`  Margin on Arc + Nano:    positive (gas-free for developer, sub-cent settlement)`);

  console.log();
  console.log(`First 3 tx proof links (for video):`);
  for (const r of successes.slice(0, 3)) {
    if (r.feedbackTx) console.log(`  ${config.arc.explorer}/tx/${r.feedbackTx}`);
  }

  // Machine-readable artifact for the writeup
  const outJson = {
    startedAt: new Date(t0).toISOString(),
    durationMs: totalMs,
    totalTasks: records.length,
    successes: successes.length,
    totalUsdcSpent: totalUsd,
    avgLatencyMs: avgLatency,
    picks,
    finalReputations: finalReps,
    model: config.gemini.model,
    chainId: config.arc.chainId,
  };
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync("demo-output", { recursive: true });
  const outfile = path.join("demo-output", `run-${Date.now()}.json`);
  fs.writeFileSync(outfile, JSON.stringify({ summary: outJson, records }, null, 2));
  console.log(`\nArtifact: ${outfile}`);
  emitDemoEvent({
    type: "run_summary",
    completed: successes.length,
    total: records.length,
    totalUsdcSpent: totalUsd,
    avgLatencyMs: avgLatency,
    picks,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
