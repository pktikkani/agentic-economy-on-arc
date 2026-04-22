/**
 * Ground-truth probe: compare the official Google GenAI SDK vs Vercel AI SDK
 * when calling Gemini 3.1 Pro with thinkingLevel="low". Logs the exact
 * request sent to Google's endpoint and wall-clock latency for both paths.
 *
 * Run: npx tsx scripts/probe-gemini.ts
 */
import { GoogleGenAI } from "@google/genai";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { config } from "../src/config.js";

const MODEL = "gemini-3.1-pro-preview";
const PROMPT = `Classify the sentiment of this text and return ONLY JSON like {"label":"positive|neutral|negative","score":0..1}:

TEXT: "I absolutely love the new dashboard."`;

// --- HTTP instrumentation: wrap global fetch so we see every outbound call ---
const origFetch = globalThis.fetch;
let httpLog: { url: string; method: string; body?: string; ms: number; status: number }[] = [];

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  const method = init?.method ?? "GET";
  const body = init?.body != null ? String(init.body) : undefined;
  const t0 = Date.now();
  const res = await origFetch(input, init);
  const ms = Date.now() - t0;
  if (url.includes("generativelanguage.googleapis.com") || url.includes("googleapis.com")) {
    httpLog.push({ url, method, body, ms, status: res.status });
  }
  return res;
}) as any;

function pretty(obj: any) {
  return JSON.stringify(obj, null, 2);
}

async function viaOfficialSDK() {
  httpLog = [];
  console.log("\n" + "=".repeat(80));
  console.log("A) Official @google/genai — thinkingLevel=\"low\"");
  console.log("=".repeat(80));
  const client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  const t0 = Date.now();
  const resp = await client.models.generateContent({
    model: MODEL,
    contents: PROMPT,
    config: {
      thinkingConfig: { thinkingLevel: "low" } as any,
    },
  });
  const ms = Date.now() - t0;
  console.log(`wall: ${ms}ms`);
  console.log(`response text: ${(resp.text ?? "").slice(0, 300)}`);
  console.log(`\nHTTP calls (${httpLog.length}):`);
  for (const h of httpLog) {
    console.log(`  [${h.status}] ${h.method} ${h.url}  ${h.ms}ms`);
    if (h.body) {
      let parsed: any = undefined;
      try {
        parsed = JSON.parse(h.body);
      } catch {}
      console.log(`  request body:\n${pretty(parsed ?? h.body).split("\n").map((l) => "    " + l).join("\n")}`);
    }
  }
  return ms;
}

async function viaVercelSDK(thinkingLevel?: "low" | "medium" | "high") {
  httpLog = [];
  console.log("\n" + "=".repeat(80));
  console.log(`B) Vercel @ai-sdk/google — thinkingLevel=${thinkingLevel ?? "(not set)"}`);
  console.log("=".repeat(80));
  const model = google(MODEL);
  const t0 = Date.now();
  const providerOptions = thinkingLevel
    ? { google: { thinkingConfig: { thinkingLevel } } }
    : undefined;
  const { text } = await generateText({
    model,
    prompt: PROMPT,
    ...(providerOptions ? { providerOptions } : {}),
  });
  const ms = Date.now() - t0;
  console.log(`wall: ${ms}ms`);
  console.log(`response text: ${text.slice(0, 300)}`);
  console.log(`\nHTTP calls (${httpLog.length}):`);
  for (const h of httpLog) {
    console.log(`  [${h.status}] ${h.method} ${h.url}  ${h.ms}ms`);
    if (h.body) {
      let parsed: any = undefined;
      try {
        parsed = JSON.parse(h.body);
      } catch {}
      console.log(`  request body:\n${pretty(parsed ?? h.body).split("\n").map((l) => "    " + l).join("\n")}`);
    }
  }
  return ms;
}

/**
 * Raw REST probe with EXACT wire shape as Google's docs show:
 *   "thinkingConfig": { "thinking_level": "LOW" }
 * If the SDKs are serializing differently, this tells us what the server
 * actually wants.
 */
async function viaRawRest(field: "thinkingLevel" | "thinking_level", value: "low" | "LOW") {
  httpLog = [];
  console.log("\n" + "=".repeat(80));
  console.log(`C) Raw REST — generationConfig.thinkingConfig.${field}="${value}"`);
  console.log("=".repeat(80));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.gemini.apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    generationConfig: {
      thinkingConfig: { [field]: value },
    },
  };
  const t0 = Date.now();
  const res = await origFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const j: any = await res.json().catch(() => ({}));
  const text: string = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no text)";
  console.log(`wall: ${ms}ms   status: ${res.status}`);
  console.log(`sent body:\n${JSON.stringify(body, null, 2).split("\n").map((l) => "  " + l).join("\n")}`);
  console.log(`response text: ${text.slice(0, 300)}`);
  if (j?.error) {
    console.log(`ERROR: ${JSON.stringify(j.error).slice(0, 400)}`);
  }
  // usage_metadata may include thoughtsTokenCount, which confirms thinking actually took place
  if (j?.usageMetadata) {
    console.log(`usage: ${JSON.stringify(j.usageMetadata)}`);
  }
  return ms;
}

async function main() {
  const a = await viaOfficialSDK();
  const b1 = await viaVercelSDK("low");
  const b2 = await viaVercelSDK();
  const c1 = await viaRawRest("thinkingLevel", "low");
  const c2 = await viaRawRest("thinking_level", "LOW");
  const c3 = await viaRawRest("thinking_level", "low");
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`official SDK   (low):                             ${a}ms`);
  console.log(`Vercel SDK     (low):                             ${b1}ms`);
  console.log(`Vercel SDK     (no option):                       ${b2}ms`);
  console.log(`raw REST       thinkingLevel="low":               ${c1}ms`);
  console.log(`raw REST       thinking_level="LOW":              ${c2}ms`);
  console.log(`raw REST       thinking_level="low":              ${c3}ms`);
  console.log();
  console.log("Look at the HTTP bodies above to see which shape actually activates LOW.");
  console.log("If usage.thoughtsTokenCount is 0 or low, LOW is working.");
  console.log("If it's high, the option was silently ignored.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
