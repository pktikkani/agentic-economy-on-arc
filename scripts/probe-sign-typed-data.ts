/**
 * Path 2 — Checkpoint 3: can the Circle-managed wallet sign EIP-712 typed
 * data? This is the critical test. Nanopayments / x402 requires EIP-712
 * (specifically EIP-3009 TransferWithAuthorization) signatures to work.
 *
 * We construct a minimal EIP-712 message (a dummy TransferWithAuthorization)
 * and ask Circle's signTypedData API to sign it. If we get a 0x... signature
 * back, we're unblocked.
 *
 * Run: npx tsx scripts/probe-sign-typed-data.ts
 */
import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { config } from "../src/config.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}. Run bootstrap-circle-wallet.ts first.`);
  return v;
}

async function main() {
  const apiKey = required("CIRCLE_API_KEY");
  const entitySecret = required("CIRCLE_ENTITY_SECRET");
  const walletId = required("CIRCLE_WALLET_ID");
  const walletAddress = required("CIRCLE_WALLET_ADDRESS");

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  // Minimal EIP-712 TransferWithAuthorization payload, mirroring what
  // x402 / Nanopayments produces. Values are dummy — we only care that
  // signing succeeds.
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    domain: {
      name: "GatewayWalletBatched",
      version: "1",
      chainId: config.arc.chainId,
      verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9", // GatewayWallet on Arc
    },
    message: {
      from: walletAddress,
      to: "0x0B2F6cC1126BdAbCa34D2a260A057AFd56cBc5ab", // broker A address, any valid addr
      value: "5000", // 5000 atomic units = $0.005 USDC
      validAfter: "0",
      validBefore: String(Math.floor(Date.now() / 1000) + 3600),
      nonce: "0x" + "00".repeat(32),
    },
  };

  console.log("Asking Circle to sign EIP-712 TransferWithAuthorization...");
  console.log(`  wallet: ${walletId}`);
  console.log(`  from:   ${walletAddress}`);

  const t0 = Date.now();
  const res = await client.signTypedData({
    walletId,
    data: JSON.stringify(typedData),
  });
  const ms = Date.now() - t0;

  const sig = (res as any)?.data?.signature;
  console.log(`\nResult in ${ms}ms:`);
  console.log(`  signature: ${sig}`);
  if (!sig || !/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    throw new Error(`Signature looks malformed. Got: ${sig}`);
  }
  console.log("\n✅ EIP-712 signing works. Path 2 is unblocked.");
}

main().catch((e) => {
  console.error("\n❌ EIP-712 signing failed.");
  console.error(e);
  process.exit(1);
});
