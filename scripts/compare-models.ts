/**
 * Head-to-head: Gemini 3.1 Pro Preview vs Gemini 3 Flash Preview,
 * same prompts, same judge, same tasks. Apples to apples.
 *
 * For each of 3 task types (sentiment, price-lookup, summarize):
 *   - Call Pro, measure latency, judge output
 *   - Call Flash, measure latency, judge output
 *
 * Prints a comparison table at the end.
 *
 * Run: npx tsx scripts/compare-models.ts
 */
import { generateTextRaw } from "../src/circle/gemini-raw.js";
import { judgeOutput } from "../src/reputation/judge.js";

const tasks: {
  service: "sentiment" | "price-lookup" | "summarize";
  task: string;
  prompt: (x: string) => string;
  input: string;
}[] = [
  {
    service: "sentiment",
    task: "Classify sentiment: 'I absolutely love the new dashboard.'",
    input: "I absolutely love the new dashboard.",
    prompt: (x) =>
      `You are a sentiment classifier. Classify the TEXT below and return ONLY a JSON object like {"label": "positive"|"neutral"|"negative", "score": 0..1}. Be precise, cite concrete evidence, avoid hedging.

TEXT:
"""
${x}
"""`,
  },
  {
    service: "price-lookup",
    task: "What is the USD price of BTC?",
    input: "What is the USD price of BTC?",
    prompt: (x) =>
      `You are a price lookup service. The user is asking about a ticker or asset (below). Return ONLY a JSON object like {"ticker": "...", "price_usd": number, "source": "mocked"}. Invent a plausible current-ish price. Be precise, cite concrete evidence, avoid hedging.

QUERY:
"""
${x}
"""`,
  },
  {
    service: "summarize",
    task: "Summarize: 'Arc is a stablecoin-native L1 where USDC is the gas token and finality is sub-second.'",
    input: "Arc is a stablecoin-native L1 where USDC is the gas token and finality is sub-second.",
    prompt: (x) =>
      `You are a text summarizer. Summarize the TEXT below and return ONLY a JSON object like {"summary": "...", "key_points": ["..."]}. Be precise, cite concrete evidence, avoid hedging.

TEXT:
"""
${x}
"""`,
  },
];

const MODELS = [
  { label: "Pro 3.1", id: "gemini-3.1-pro-preview" },
  { label: "Flash 3", id: "gemini-3-flash-preview" },
  { label: "Flash-Lite 3.1", id: "gemini-3.1-flash-lite-preview" },
];

type Row = {
  service: string;
  modelLabel: string;
  latencyMs: number;
  output: string;
  judgeQuality: number;
  judgeReason: string;
};

async function runOne(modelId: string, promptText: string): Promise<{ text: string; ms: number }> {
  try {
    const { text, ms } = await generateTextRaw(promptText, { model: modelId, thinkingLevel: "low" });
    return { text, ms };
  } catch (e: any) {
    // Some Flash variants may not accept thinkingLevel — retry without it
    if (/thinking|enum|invalid/i.test(e.message ?? "")) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: promptText }] }],
          }),
        }
      );
      const t0 = Date.now();
      const j: any = await res.json();
      return {
        text: j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        ms: Date.now() - t0,
      };
    }
    throw e;
  }
}

async function main() {
  const rows: Row[] = [];

  for (const task of tasks) {
    const promptText = task.prompt(task.input);
    for (const m of MODELS) {
      console.log(`\n→ ${m.label} on [${task.service}]`);
      const { text, ms } = await runOne(m.id, promptText);
      console.log(`  ${ms}ms`);
      console.log(`  output: ${text.slice(0, 180).replace(/\n/g, " ")}${text.length > 180 ? "…" : ""}`);
      const judge = await judgeOutput(task.task, task.service, text);
      console.log(`  judge: ${judge.quality.toFixed(2)} — ${judge.reason}`);
      rows.push({
        service: task.service,
        modelLabel: m.label,
        latencyMs: ms,
        output: text,
        judgeQuality: judge.quality,
        judgeReason: judge.reason,
      });
    }
  }

  console.log("\n" + "=".repeat(90));
  console.log("HEAD-TO-HEAD: Gemini 3.1 Pro vs Gemini 3 Flash (same prompts, same judge)");
  console.log("=".repeat(90));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  console.log(pad("service", 14) + pad("model", 10) + pad("latency", 12) + pad("judge", 8) + "reason");
  console.log("-".repeat(90));
  for (const r of rows) {
    console.log(
      pad(r.service, 14) +
        pad(r.modelLabel, 10) +
        pad(`${r.latencyMs}ms`, 12) +
        pad(r.judgeQuality.toFixed(2), 8) +
        r.judgeReason.slice(0, 60)
    );
  }

  // Aggregate
  const totals: Record<string, { lat: number; qSum: number; qN: number }> = {};
  for (const r of rows) {
    totals[r.modelLabel] ??= { lat: 0, qSum: 0, qN: 0 };
    totals[r.modelLabel]!.lat += r.latencyMs;
    totals[r.modelLabel]!.qSum += r.judgeQuality;
    totals[r.modelLabel]!.qN += 1;
  }
  console.log("\nAggregate:");
  for (const [label, t] of Object.entries(totals)) {
    const avgQ = t.qSum / t.qN;
    console.log(`  ${label}:  total ${t.lat}ms   avg ${Math.round(t.lat / t.qN)}ms/call   avg judge ${avgQ.toFixed(2)}`);
  }

  // Delta
  const pro = totals["Pro 3.1"];
  const flash = totals["Flash 3"];
  if (pro && flash) {
    const speedup = pro.lat / flash.lat;
    const qualityDelta = pro.qSum / pro.qN - flash.qSum / flash.qN;
    console.log(`\nFlash is ${speedup.toFixed(1)}x faster. Quality delta (Pro − Flash): ${qualityDelta.toFixed(2)} (positive = Pro better)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
