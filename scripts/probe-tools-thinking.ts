/**
 * Hypothesis: declaring tools in the request forces Pro to use full thinking,
 * ignoring thinkingLevel="low". Compare identical prompts with and without
 * `tools` present.
 *
 * Run: npx tsx scripts/probe-tools-thinking.ts
 */
import { config } from "../src/config.js";

const MODEL = "gemini-3.1-pro-preview";
const ENDPOINT = (m: string, k: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;

const PROMPT =
  "Call the pick_broker function with broker_id=B and input='I love this'. Do nothing else.";

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "pick_broker",
        description: "Pick a broker and send them an input string.",
        parameters: {
          type: "object",
          properties: {
            broker_id: { type: "string" },
            input: { type: "string" },
          },
          required: ["broker_id", "input"],
        },
      },
    ],
  },
];

async function call(label: string, body: any) {
  const t0 = Date.now();
  const res = await fetch(ENDPOINT(MODEL, config.gemini.apiKey), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const j: any = await res.json();
  const usage = j?.usageMetadata;
  console.log(`${label}: ${ms}ms  thoughts=${usage?.thoughtsTokenCount ?? "?"}  output=${usage?.candidatesTokenCount ?? "?"}`);
}

async function main() {
  await call("no tools, thinkingLevel:low", {
    contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
  });
  await call("WITH tools, thinkingLevel:low", {
    contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    tools: TOOLS,
    generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
  });
  await call("WITH tools, NO thinkingConfig", {
    contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    tools: TOOLS,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
