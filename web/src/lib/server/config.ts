import { ensureServerEnvLoaded } from "./load-env";

ensureServerEnvLoaded();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export type BrokerId = "A" | "B" | "C" | "D" | "E";
export type BrokerService = "sentiment" | "price-lookup" | "summarize";

export type BrokerMeta = {
  id: BrokerId;
  name: string;
  service: BrokerService;
  price: string;
  quality: number;
  url: string;
};

const brokerBase = {
  A: process.env.BROKER_A_URL ?? "http://127.0.0.1:3001",
  B: process.env.BROKER_B_URL ?? "http://127.0.0.1:3002",
  C: process.env.BROKER_C_URL ?? "http://127.0.0.1:3003",
  D: process.env.BROKER_D_URL ?? "http://127.0.0.1:3004",
  E: process.env.BROKER_E_URL ?? "http://127.0.0.1:3005",
} as const;

export const BROKERS: BrokerMeta[] = [
  { id: "A", name: "FastSent", service: "sentiment", price: "$0.003", quality: 0.65, url: brokerBase.A },
  { id: "B", name: "DeepSent", service: "sentiment", price: "$0.008", quality: 0.92, url: brokerBase.B },
  { id: "C", name: "QuickPrice", service: "price-lookup", price: "$0.002", quality: 0.7, url: brokerBase.C },
  { id: "D", name: "SharpPrice", service: "price-lookup", price: "$0.007", quality: 0.95, url: brokerBase.D },
  { id: "E", name: "Summarizer", service: "summarize", price: "$0.005", quality: 0.85, url: brokerBase.E },
];

export const DEMO_TASKS: string[] = [
  "Classify sentiment: 'I absolutely love the new dashboard.'",
  "Classify sentiment: 'Shipping took 3 weeks and arrived damaged.'",
  "Classify sentiment: 'The app is fine, nothing special.'",
  "Classify sentiment: 'Best purchase I've made all year!'",
  "Classify sentiment: 'Terrible customer service, will not buy again.'",
  "Classify sentiment: 'It works as advertised.'",
  "Classify sentiment: 'Exceeded every expectation I had.'",
  "Classify sentiment: 'Worst UX redesign I've ever seen.'",
  "Classify sentiment: 'Neutral experience overall, would use again if free.'",
  "Classify sentiment: 'Incredible value for the price.'",
  "Classify sentiment: 'The latest update broke three features I depended on.'",
  "Classify sentiment: 'Support team is responsive and kind.'",
  "Classify sentiment: 'Feels half-baked but has potential.'",
  "Classify sentiment: 'One of the best tools in its category.'",
  "Classify sentiment: 'App crashes within 30 seconds of opening.'",
  "Classify sentiment: 'It does what it says on the tin.'",
  "Classify sentiment: 'Refund requested, product was not as described.'",
  "What is the USD price of BTC?",
  "What is the USD price of ETH?",
  "What is the USD price of SOL?",
  "What is the USD price of AVAX?",
  "What is the USD price of ARB?",
  "What is the USD price of OP?",
  "What is the USD price of MATIC?",
  "What is the USD price of LINK?",
  "What is the USD price of UNI?",
  "What is the USD price of AAVE?",
  "What is the USD price of DOGE?",
  "What is the USD price of ADA?",
  "What is the USD price of DOT?",
  "What is the USD price of ATOM?",
  "What is the USD price of NEAR?",
  "What is the USD price of SUI?",
  "What is the USD price of TIA?",
  "Summarize: 'Arc is a stablecoin-native L1 where USDC is the gas token and finality is sub-second.'",
  "Summarize: 'Circle Nanopayments enables gas-free USDC transfers as small as one millionth of a dollar via EIP-3009 signed authorizations and off-chain batching.'",
  "Summarize: 'ERC-8004 defines identity, reputation, and optional validation registries for trustless AI agents, giving each agent an NFT-based ID.'",
  "Summarize: 'Function calling in LLMs lets an agent invoke typed tools by emitting a structured call that the runtime executes and feeds back.'",
  "Summarize: 'The x402 standard uses HTTP 402 Payment Required to negotiate per-request pricing between client and server.'",
  "Summarize: 'Sub-cent transaction economics make per-API-call billing viable; traditional EVM gas makes it structurally unprofitable.'",
  "Summarize: 'In an agent marketplace, reputation acts as a price-quality tiebreaker when multiple brokers offer the same service.'",
  "Summarize: 'A batched settlement system aggregates many offchain authorizations and commits them on-chain in a single transaction.'",
  "Summarize: 'Sellers in a paid API system verify signed payment authorizations server-side before serving the resource.'",
  "Summarize: 'An agent judge scores the output of another agent and writes the score into an on-chain reputation registry.'",
  "Summarize: 'Stablecoin-denominated gas lets dapps price services in USD units without FX exposure to a volatile native token.'",
  "Summarize: 'Machine-to-machine commerce requires payment primitives that clear at the speed and cost of an API call.'",
  "Summarize: 'A requester agent routes a user task to the best broker based on service fit, price, and historical reputation.'",
  "Summarize: 'On-chain reputation needs a scoring function that is attack-resistant, low-cost to write, and fast to read.'",
  "Summarize: 'Gateway wallets let a user deposit USDC once and authorize many off-chain payments that settle later in batch.'",
  "Summarize: 'The agentic economy is the hypothesis that autonomous software agents will become first-class economic participants.'",
];

export const config = {
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3-flash-preview",
  arc: {
    rpcUrl: process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
    chainId: Number(process.env.ARC_CHAIN_ID ?? 5042002),
    explorer: process.env.ARC_EXPLORER ?? "https://testnet.arcscan.app",
    usdc: (process.env.USDC_CONTRACT ?? "0x3600000000000000000000000000000000000000") as `0x${string}`,
  },
  circle: {
    apiKey: required("CIRCLE_API_KEY"),
    entitySecret: required("CIRCLE_ENTITY_SECRET"),
    walletId: required("CIRCLE_WALLET_ID"),
    walletAddress: required("CIRCLE_WALLET_ADDRESS") as `0x${string}`,
  },
} as const;

export function brokerById(id: BrokerId): BrokerMeta {
  const broker = BROKERS.find((entry) => entry.id === id);
  if (!broker) {
    throw new Error(`Unknown broker id: ${id}`);
  }
  return broker;
}

export function brokerServiceUrl(broker: BrokerMeta, path = "/service"): string {
  return `${broker.url}${path}`;
}
