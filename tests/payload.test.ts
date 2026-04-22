/**
 * Payload delivery test — red first.
 *
 * The Day 4 debug revealed that broker B was receiving EMPTY bodies, so it
 * returned "no input was provided". That made judge scores 0 for correct
 * task setups. This test locks the payload-round-trip path so the same bug
 * cannot come back.
 *
 * We bypass the requester LLM and call the broker directly via payBroker(),
 * asserting the broker echoes back what we sent.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { payBroker } from "../src/circle/pay.js";
import { BROKERS, brokerUrl } from "../src/brokers/registry.js";

async function sellerUp(): Promise<boolean> {
  try {
    const r = await fetch("http://localhost:3001/health");
    return r.ok;
  } catch {
    return false;
  }
}

describe("payload delivery", () => {
  beforeAll(async () => {
    if (!(await sellerUp())) throw new Error("Start brokers: npm run brokers");
  });

  it("broker actually sees the input text we sent (regression for empty-body bug)", async () => {
    // Use broker A (cheap sentiment). We send a UNIQUE, emotionally clear
    // marker so we can assert on content echoing, not just absence of a phrase.
    const brokerA = BROKERS[0]!;
    const MARKER = `zorblax_${Date.now()}`;
    const input = `This product is absolutely wonderful. [tag:${MARKER}]`;

    const { status, data } = await payBroker(brokerUrl(brokerA, "/service"), {
      input,
    });

    expect(status).toBe(200);
    expect(data.result?.output).toBeDefined();
    const out: string = String(data.result.output).toLowerCase();
    // Broker must NOT claim "no input"
    expect(out).not.toMatch(/no input/);
    expect(out).not.toMatch(/no text (was )?provided/);
    // Broker must produce a sentiment label (positive is the right answer)
    expect(out).toMatch(/positive|label/);
  });
});
