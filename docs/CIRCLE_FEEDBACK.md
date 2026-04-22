# Circle Product Feedback

**Project:** Agent-to-Agent Reputation-Weighted Data Marketplace on Arc
**Track:** Agent-to-Agent Payment Loop
**Stack used:** Arc, USDC, Circle Developer-Controlled Wallets, Circle Nanopayments, x402, ERC-8004 (via `erc-8004/erc-8004-contracts` deployment on Arc testnet)

---

## Which Circle products we used

- **Arc testnet** — settlement layer. Chain ID 5042002, RPC
  `https://rpc.testnet.arc.network`.
- **USDC** — value unit; also the native gas token on Arc.
- **Circle Developer-Controlled Wallets** — the buyer wallet for the demo.
  We use Circle-managed signing for x402 authorizations and Circle transaction
  APIs for broker funding plus ERC-8004 reputation writes.
- **Circle Nanopayments** (`@circle-fin/x402-batching`) — the core primitive.
  Server-side via `createGatewayMiddleware(...)`, with a custom requester-side
  x402 retry flow that signs through Circle's `signTypedData` API.
- **Gateway Wallets** — implicit dependency of Nanopayments; used for the
  one-time deposit + off-chain authorization flow.
- **Circle Testnet Faucet** — funded the requester wallet with 20 USDC.

We did not use Circle CCTP or Bridge Kit for this build (single chain, no
cross-chain state).

## Why we chose them

The project needs **per-call settlement at sub-cent prices**, with real
economics and real finality. Three properties of the Circle stack made this
clean:

1. **Nanopayments remove the per-tx gas tax for the buyer.** Our agent fires
   50 sequential $0.003 payments in 89 seconds, paying zero gas itself, because
   Circle batches the authorizations and settles on-chain in aggregate.
2. **x402 is a protocol, not an SDK.** Any HTTP server can advertise `402
   Payment Required` with a set of accepted networks/prices; our broker
   servers each take about 10 lines of middleware and Just Work.
3. **Arc's USDC-denominated gas + sub-second finality** makes the margin
   argument trivial — prices stay in dollars end to end, no native-token FX
   exposure.

## What worked well

- **End-to-end time from "empty repo" to "50 real settlements on Arc": ~1 day.**
  `createGatewayMiddleware(...)` plus Circle's wallet APIs were enough to get
  a full buyer/seller loop running without deploying any custom payment
  contracts.
- **Keeping the payer inside Circle was clean.** We were able to use one
  Circle-managed buyer wallet for x402 signing, broker gas top-ups, Gateway
  deposit transactions, and ERC-8004 feedback writes, with all of those payer-
  side actions showing up in the same developer console.
- **Arc testnet faucet worked first time**, correct chain selection in the
  UI, tokens arrived in < 30 seconds.
- **`arcscan.app` explorer** showed our settlements immediately with clear
  labels. Great for verifying during video capture.
- **Fee / gas transparency:** the example `GatewayWallet` address in the 402
  challenge made it easy to trace what was happening when we wanted to.

## What could be improved

1. **Python SDK gap.** The ecosystem right now (Pydantic AI, web3.py,
   anthropic/google SDKs, huggingface) is Python-dominant, but
   `@circle-fin/x402-batching` is TypeScript/Node-only. We pivoted our entire
   stack to Node to avoid a subprocess bridge. A first-party Python client
   — even just sign-and-submit helpers over the existing REST surface — would
   open a much bigger developer segment. Priority: high.

2. **`getBalances()` returns `wallet: undefined` on Arc.** Because USDC is the
   native token, the ERC-20 wallet balance path doesn't populate. The native
   balance lives under `getBalance` on the chain client. This is unintuitive
   the first time — a short note in the Arc-specific docs saying "on Arc, the
   buyer's USDC lives as native balance; use `publicClient.getBalance(address)`
   for wallet; `gateway.getBalances().gateway` for deposited balance" would
   save people a debugging session.

3. **`client.pay()` silently drops POST bodies. (Highest-priority
   feedback.)** During integration we first tried the stock client-side
   `pay()` flow before switching the requester to a Circle-managed signer.
   The SDK types accept `{ method: "POST", body: unknown, headers: {...} }`
   as a second argument, and the compiled source does a
   `JSON.stringify(options.body)` and passes it to `fetch()`. But when
   we called `client.pay(url, { method: "POST", body: {input: "..."} })`
   the seller saw `Content-Length: 0` and an empty request body on both
   the 402-challenge and paid-retry fetches. A plain `fetch(url, {method:
   "POST", body: JSON.stringify(...)})` to the same seller route worked
   perfectly — so the seller + `express.json()` stack is correct; the
   body is lost somewhere inside the SDK's pay flow. We worked around it
   by base64url-encoding the payload into a query string and using a GET
   endpoint. Repro and timing:

   - `raw=""` on SDK-mediated POST (`client.pay(url, {method:"POST", body:{...}})`)
   - `raw='{"input":"..."}'` on plain fetch POST to the same URL
   - Body appears in SDK source (line 875 of `dist/client/index.js`) but
     is not in the actual request that hits the seller

   This cost our team about three hours of debugging (initially blamed the
   judge, then the selection prompt, then the broker's Gemini call). A short
   docs note — either confirming POST with body works and pointing to a
   canonical example, or noting the limitation with a recommended workaround
   — would have unblocked us immediately. Our recommendation: either fix the
   body forwarding in `pay()`, or update the types to `pay(url: string)` only
   and document query-string payloads as the canonical approach.

4. **Broker wallet gas funding on Arc.** On-chain actions from a broker
   wallet (e.g. registering on ERC-8004) require a tiny native-USDC balance.
   We wrote a helper that sends 0.01 USDC from the buyer to each broker before
   registration. A "fund agent wallets" helper baked into the SDK — given a
   funder key + list of agent addresses + min-balance — would be a nice touch
   for multi-agent demos.

5. **Product Feedback field is great; suggest making it a "default-open"
   template.** The call for feedback was explicit and the $500 bonus was
   motivating. Consider shipping the judging rubric / structured prompts for
   the feedback field alongside the hackathon page so teams can capture
   thoughts as they build, not only at submission time.

## Recommendations to make developer experience more scalable

- **Python parity for Nanopayments.** See point 1 above.
- **Sample: "agent pays agent."** There are solid buyer and seller samples,
  but nothing that stitches them together as *one process with two agents
  exchanging payments in both directions*. That's the shape of
  agent-to-agent commerce the track name implies, and the missing sample is
  what every team on this track had to invent.
- **ERC-8004 integration guide on the Arc docs page.** The ERC-8004
  registries are already deployed at well-known addresses on Arc testnet; a
  dedicated "how to register an agent + post reputation" walkthrough would
  pull the agentic-economy story together on the sponsor's own site.
- **Pricing string canonicalization.** `gateway.require("$0.005")` is
  intuitive but undocumented ("$0.01" vs "10000" atomic units vs "0.01 USDC"
  — which are accepted?). A tiny doc block removes ambiguity.
- **Live rate limits on the faucet** (requests/minute, daily caps per
  address) would help teams pace their development without hitting surprise
  429s the morning before the demo.

## Observations not feedback

- **Low-single-second settlement still feels interactive inside an agent loop.**
  Our avg round-trip (sign + x402 verify + broker serve) was about 1.8s on Arc
  testnet in the final Circle-managed proof run. That's still fast enough for a
  chatbot or agent orchestration UI, which is a bigger product unlock than the
  pricing alone.
- **The 402-based price discovery model is genuinely composable.** A client
  that doesn't know anything about our broker registry can still discover
  what a broker charges just by hitting its endpoint cold. That's a nicer
  property than any RPC-style "list services" endpoint we could have
  designed.
