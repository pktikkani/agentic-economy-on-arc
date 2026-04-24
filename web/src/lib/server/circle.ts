import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createPublicClient, getAddress, http } from "viem";

import { config } from "./config";

const CIRCLE_BATCHING_NAME = "GatewayWalletBatched";
const CIRCLE_BATCHING_VERSION = "1";
const USDC_ON_ARC = "0x3600000000000000000000000000000000000000" as const;
const GATEWAY_WALLET_ARC = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;

const authorizationTypes = {
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
} as const;

type PaymentRequirement = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;
    version?: string;
    verifyingContract?: string;
  };
};

type PaymentRequired = {
  x402Version: number;
  resource: unknown;
  accepts: PaymentRequirement[];
};

const pub = createPublicClient({ transport: http(config.arc.rpcUrl) });

function mediumFee() {
  return {
    type: "level" as const,
    config: { feeLevel: "MEDIUM" as const },
  };
}

function getCircleClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: config.circle.apiKey,
    entitySecret: config.circle.entitySecret,
  });
}

type CircleSignatureResponse = { data?: { signature?: string } };
type CircleTransactionLookupResponse = { data?: { transaction?: { state?: string; txHash?: string } } };
type CircleContractExecutionResponse = { data?: { id?: string } };

function randomNonceHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function pickArcBatchingOption(req: PaymentRequired): PaymentRequirement {
  const expectedNetwork = `eip155:${config.arc.chainId}`;
  const option = req.accepts.find(
    (entry) =>
      entry.network === expectedNetwork &&
      entry.extra?.name === CIRCLE_BATCHING_NAME &&
      entry.extra?.version === CIRCLE_BATCHING_VERSION &&
      typeof entry.extra?.verifyingContract === "string"
  );
  if (!option) {
    throw new Error("No Arc GatewayWalletBatched option in 402 response");
  }
  return option;
}

async function signAuthorizationViaCircle(requirement: PaymentRequirement) {
  const verifyingContract = getAddress(requirement.extra!.verifyingContract!);
  const to = getAddress(requirement.payTo);
  const now = Math.floor(Date.now() / 1000);

  const authorization = {
    from: config.circle.walletAddress,
    to,
    value: requirement.amount,
    validAfter: String(now - 600),
    validBefore: String(now + requirement.maxTimeoutSeconds),
    nonce: randomNonceHex(),
  };

  const typedData = {
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    domain: {
      name: CIRCLE_BATCHING_NAME,
      version: CIRCLE_BATCHING_VERSION,
      chainId: Number(requirement.network.split(":")[1]),
      verifyingContract,
    },
    message: authorization,
  };

  const client = getCircleClient();
  const response = (await client.signTypedData({
    walletId: config.circle.walletId,
    data: JSON.stringify(typedData),
  })) as CircleSignatureResponse;
  const signature = response.data?.signature;
  if (!signature) {
    throw new Error("Circle signTypedData returned no signature");
  }
  return { authorization, signature };
}

export async function ensureGatewayFunded(minUsdc = 1) {
  const available = (await pub.readContract({
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
    args: [USDC_ON_ARC, config.circle.walletAddress],
  })) as bigint;

  const minAtomic = BigInt(Math.floor(minUsdc * 1_000_000));
  if (available < minAtomic) {
    throw new Error(
      `Gateway available balance (${available}) below minimum (${minAtomic}). Top up the Circle wallet deposit first.`
    );
  }
}

export async function waitForCircleTransaction(id: string, label: string, timeoutMs = 120_000) {
  const client = getCircleClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = ((await client.getTransaction({ id })) as CircleTransactionLookupResponse).data?.transaction;
    const state = tx?.state;
    if (state === "COMPLETE") return tx;
    if (state === "FAILED" || state === "CANCELED" || state === "DENIED") {
      throw new Error(`${label} tx ended in state ${state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`${label} tx timeout after ${timeoutMs}ms`);
}

export async function createCircleContractExecution(params: {
  contractAddress: `0x${string}`;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  amount?: string;
  refId?: string;
}) {
  const client = getCircleClient();
  const response = (await client.createContractExecutionTransaction({
    walletId: config.circle.walletId,
    contractAddress: params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters,
    amount: params.amount,
    refId: params.refId,
    fee: mediumFee(),
  })) as CircleContractExecutionResponse;
  const txId = response.data?.id;
  if (!txId) {
    throw new Error("Circle contract execution missing tx id");
  }
  const tx = await waitForCircleTransaction(txId, "contract execution");
  if (!tx?.txHash) {
    throw new Error("Circle contract execution missing tx hash");
  }
  return tx.txHash as `0x${string}`;
}

export async function circlePay<T = unknown>(url: string): Promise<{ status: number; data: T }> {
  const initial = await fetch(url, { method: "GET", cache: "no-store" });
  if (initial.status !== 402) {
    if (initial.ok) {
      return { status: initial.status, data: (await initial.json()) as T };
    }
    throw new Error(`Unexpected status ${initial.status} on initial request`);
  }

  const header = initial.headers.get("PAYMENT-REQUIRED");
  if (!header) throw new Error("Missing PAYMENT-REQUIRED header on 402");
  const paymentRequired = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentRequired;
  const option = pickArcBatchingOption(paymentRequired);
  const { authorization, signature } = await signAuthorizationViaCircle(option);

  const paymentHeader = Buffer.from(
    JSON.stringify({
      x402Version: paymentRequired.x402Version ?? 2,
      payload: { authorization, signature },
      resource: paymentRequired.resource,
      accepted: option,
    })
  ).toString("base64");

  const paid = await fetch(url, {
    method: "GET",
    headers: { "Payment-Signature": paymentHeader },
    cache: "no-store",
  });

  if (!paid.ok) {
    const body = await paid.text();
    throw new Error(`Paid request failed ${paid.status}: ${body.slice(0, 500)}`);
  }

  return { status: paid.status, data: (await paid.json()) as T };
}

export async function payBroker<T = unknown>(url: string, body: unknown) {
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sep = url.includes("?") ? "&" : "?";
  return circlePay<T>(`${url}${sep}payload=${payload}`);
}
