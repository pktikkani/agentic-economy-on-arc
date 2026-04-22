/**
 * Smoke test: verify the Circle-managed buyer wallet is funded on Arc and has
 * Gateway balance ready for x402 payments.
 *
 * Run: npm run smoke
 */
import { createPublicClient, formatUnits, http } from "viem";
import { config } from "../src/config.js";
import { getCircleWalletConfig } from "../src/circle/dev-wallet.js";

const USDC_ON_ARC = "0x3600000000000000000000000000000000000000" as const;
const GATEWAY_WALLET_ARC = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;

async function main() {
  const { walletAddress } = getCircleWalletConfig();
  const client = createPublicClient({
    transport: http(config.arc.rpcUrl),
  });

  const nativeWei = await client.getBalance({ address: walletAddress });
  const deposited = (await client.readContract({
    address: GATEWAY_WALLET_ARC,
    abi: [
      {
        name: "availableBalance",
        type: "function",
        stateMutability: "view",
        inputs: [
          { name: "token", type: "address" },
          { name: "depositor", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "availableBalance",
    args: [USDC_ON_ARC, walletAddress],
  })) as bigint;

  console.log(`Buyer address:      ${walletAddress}`);
  console.log(`Buyer on Arc:       ${config.arc.explorer}/address/${walletAddress}`);
  console.log(`Native USDC:        ${formatUnits(nativeWei, 18)}`);
  console.log(`Gateway available:  ${formatUnits(deposited, 6)} USDC`);

  if (deposited < 1_000_000n) {
    throw new Error(
      "Gateway balance below 1 USDC. Top up with: npx tsx scripts/deposit-to-gateway.ts 1"
    );
  }

  console.log("\nSmoke test OK. Buyer wallet and Gateway deposit are ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
