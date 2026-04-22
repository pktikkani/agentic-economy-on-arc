/**
 * Judge calibration tests — red first.
 *
 * The Day 4 dry run surfaced that the judge was grading correct sentiment
 * outputs at 0.00, apparently confused by markdown-fenced JSON or by grading
 * "delivery" instead of "answer correctness". These tests pin the expected
 * behavior before we touch the judge prompt.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { judgeOutput } from "../src/reputation/judge.js";

describe("judge calibration", () => {
  it("grades a correct positive sentiment classification >= 0.8", async () => {
    const r = await judgeOutput(
      "Classify sentiment: 'I absolutely love the new dashboard.'",
      "sentiment",
      '```json\n{"label": "positive", "score": 0.98}\n```'
    );
    expect(r.quality).toBeGreaterThanOrEqual(0.8);
  });

  it("grades a correct negative sentiment classification >= 0.8", async () => {
    const r = await judgeOutput(
      "Classify sentiment: 'Terrible customer service, will not buy again.'",
      "sentiment",
      '{"label": "negative", "score": 0.95}'
    );
    expect(r.quality).toBeGreaterThanOrEqual(0.8);
  });

  it("grades a wrong sentiment classification <= 0.3", async () => {
    const r = await judgeOutput(
      "Classify sentiment: 'I absolutely love the new dashboard.'",
      "sentiment",
      '{"label": "negative", "score": 0.9}'
    );
    expect(r.quality).toBeLessThanOrEqual(0.3);
  });

  it("grades a mismatched-ticker price lookup <= 0.3", async () => {
    const r = await judgeOutput(
      "What is the USD price of SOL?",
      "price-lookup",
      '{"ticker": "BTC", "price_usd": 64500, "source": "mocked"}'
    );
    expect(r.quality).toBeLessThanOrEqual(0.3);
  });

  it("grades a correct-ticker price lookup >= 0.7", async () => {
    const r = await judgeOutput(
      "What is the USD price of SOL?",
      "price-lookup",
      '{"ticker": "SOL", "price_usd": 140, "source": "mocked"}'
    );
    expect(r.quality).toBeGreaterThanOrEqual(0.7);
  });
});
