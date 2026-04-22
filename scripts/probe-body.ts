/**
 * Probe: does a plain POST body reach the broker when sent OUTSIDE the SDK?
 * If yes → the SDK is stripping the body somewhere.
 * If no → the seller middleware is.
 *
 * Run: npx tsx scripts/probe-body.ts
 */
async function main() {
  const url = "http://localhost:3001/service";
  console.log("Probing POST with plain fetch (no x402) to see what the seller logs for raw body...");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "probe: plain fetch no auth" }),
  });
  console.log(`plain fetch status: ${res.status}`);
  console.log(`(expect 402 — watch seller terminal for RECV line with raw="{"input":"..."}"`);
}

main().catch(console.error);
