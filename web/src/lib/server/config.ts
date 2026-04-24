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
  "What is the USD price of SOL?",
  "Summarize: 'Arc is a stablecoin-native L1 where USDC is the gas token and finality is sub-second.'",
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
