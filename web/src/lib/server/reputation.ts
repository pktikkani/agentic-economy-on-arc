import fs from "node:fs";
import path from "node:path";

import { createPublicClient, http, keccak256, toHex } from "viem";

import { config, type BrokerId } from "./config";
import { createCircleContractExecution } from "./circle";

const ERC8004_ADDRESSES = {
  reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as `0x${string}`,
} as const;

const reputationRegistryAbi = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

const pub = createPublicClient({ transport: http(config.arc.rpcUrl) });

type CachedIds = Partial<Record<BrokerId, bigint>>;

function readIdsFromEnv(): CachedIds {
  const map: CachedIds = {};
  for (const id of ["A", "B", "C", "D", "E"] as const) {
    const value = process.env[`BROKER_AGENT_ID_${id}`];
    if (value) map[id] = BigInt(value);
  }
  return map;
}

function readIdsFromCache(): CachedIds {
  const cachePath = path.resolve(process.cwd(), "../.cache/broker-ids.json");
  if (!fs.existsSync(cachePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Record<string, string>;
  const map: CachedIds = {};
  for (const id of ["A", "B", "C", "D", "E"] as const) {
    if (parsed[id]) map[id] = BigInt(parsed[id]);
  }
  return map;
}

export function getBrokerAgentIds(): CachedIds {
  return { ...readIdsFromCache(), ...readIdsFromEnv() };
}

export async function readReputation(agentId: bigint) {
  const result = (await pub.readContract({
    address: ERC8004_ADDRESSES.reputation,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, [config.circle.walletAddress], "quality", ""],
  })) as [bigint, bigint, number];

  const [count, summaryValue, summaryDecimals] = result;
  if (count === BigInt(0)) return null;
  return {
    count: Number(count),
    avg: Number(summaryValue) / 10 ** summaryDecimals,
  };
}

export async function giveFeedback(agentId: bigint, quality: number) {
  const value = BigInt(Math.round(Math.max(0, Math.min(1, quality)) * 100));
  return createCircleContractExecution({
    contractAddress: ERC8004_ADDRESSES.reputation,
    abiFunctionSignature:
      "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
    abiParameters: [
      agentId.toString(),
      value.toString(),
      2,
      "quality",
      "",
      "",
      "",
      keccak256(toHex(`${agentId}-${Date.now()}-${value}`)),
    ],
    refId: `web-feedback-${agentId}-${Date.now()}`,
  });
}
