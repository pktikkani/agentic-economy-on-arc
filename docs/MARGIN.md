# Margin Argument — Why This Fails on Traditional EVM Gas

## The claim

Per-action pricing at or below **$0.01 per call** is only economically viable
when settlement cost is **sub-cent**. Charge that price on Ethereum mainnet and
you lose money on every transaction. Charge it on Arc with Circle Nanopayments
and you clear real margin.

## The numbers from this submission

| Metric | Value |
|---|---|
| Service price per call (broker A) | **$0.003** |
| Service price per call (broker B, quality tier) | **$0.008** |
| 50-tx proof run (`npm run fifty`) | **50/50 settlements, 89s wall, $0.15 revenue** |
| Avg latency per settlement | **~1.79s** |
| Buyer's gas paid per tx | **~$0** (Circle batches + pays on-chain gas) |
| Chain | Arc testnet (chain ID 5042002) |
| Proof receipt | `demo-output/fifty-tx-*.json` |

Buyer address on Arc explorer:
https://testnet.arcscan.app/address/0x77a280cf6552ccc946204432c2d17941c4f41832

## Comparison table

| Chain / primitive | Gas per tx | Price per call | Per-call margin | 50-call margin |
|---|---:|---:|---:|---:|
| Ethereum mainnet (ERC-20 transfer) | $0.50 – $5.00 | $0.005 | **−9,900% to −99,900%** | **−$25 to −$250** |
| Base / L2 ERC-20 transfer | $0.01 – $0.05 | $0.005 | **−100% to −900%** | **−$0.25 to −$2.25** |
| Arc direct USDC transfer | ~$0.0001 | $0.005 | +98% | +$0.245 |
| **Arc + Circle Nanopayments (this project)** | **$0 to buyer** | **$0.003 – $0.008** | **+100%** | **+$0.15 to $0.40** |

Ethereum numbers assume a 21k-gas ERC-20 transfer at 20–100 gwei with ETH at
$3k–$4k; that's the cheap-end of what per-call billing would actually cost.

## Why Nanopayments specifically

Nanopayments aren't just "cheap gas on an L2". The structural primitive is:

1. **Buyer deposits once** into a Gateway wallet on-chain
2. Every subsequent call is an **EIP-3009 signed authorization** (offchain, zero gas)
3. Seller verifies the signature and serves the resource **immediately**
4. Circle **aggregates thousands of authorizations** into a single batched
   settlement, and **pays the on-chain gas itself**
5. Sub-cent transfers down to **$0.000001** become economically clean

Per-API pricing becomes a real business model instead of a demo stunt.

## Threshold where this matters

Below ~$0.10 per call, traditional gas *dominates revenue*. That's the entire
zone agent-to-agent commerce has to live in — pay-per-query, pay-per-inference,
pay-per-action — and the zone that's been locked out of on-chain settlement
until now.

This project runs 50 settlements for 15¢ in 89 seconds, with the buyer paying
zero gas. Same workload on Ethereum mainnet would cost $25–$250 in gas to move
15¢ of value: a structurally impossible business.
