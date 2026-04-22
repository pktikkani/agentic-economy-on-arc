import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Real Arc tx + Gemini calls are slow. Set a 3-min ceiling.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    // Serial: we share on-chain state (buyer wallet nonce, reputation history).
    fileParallelism: false,
    // Only pick up .test.ts under tests/
    include: ["tests/**/*.test.ts"],
  },
});
