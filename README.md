# Agent-to-Agent Marketplace on Arc

A solo submission for the **Agentic Economy on Arc** hackathon (Apr 20–25,
2026). Track: **Agent-to-Agent Payment Loop**.

A requester agent routes user tasks to one of 5 broker agents — picked by
fit, price, and **on-chain ERC-8004 reputation** — and pays each broker per
query in sub-cent USDC nanopayments. Every payment settles on Arc. Every
broker's output is graded by an LLM judge, and the score is posted on-chain
so future picks improve over time.

**Stack:** Arc • USDC • **Circle Developer-Controlled Wallets** • Circle Nanopayments
• x402 • ERC-8004 • Gemini 3 Flash (raw REST function calling) • Node.js + TypeScript

The buyer agent signs every x402 payment through **Circle's `signTypedData` API** on a
Circle-managed wallet, and the same buyer wallet handles broker funding plus
reputation writes through Circle transaction APIs, so every payer-side tx is visible in the
[Circle Developer Console](https://console.circle.com/wallets/dev/transactions).

---

## Hackathon requirements — status

| Requirement | Status | Evidence |
|---|---|---|
| Real per-action pricing ≤ $0.01 | ✅ | $0.002–$0.008 per broker call |
| 50+ on-chain transactions in demo | ✅ | `npm run fifty` → 50/50 in 89s, receipt in `demo-output/` |
| Margin explanation vs. traditional gas | ✅ | [docs/MARGIN.md](docs/MARGIN.md) |
| Transaction flow video incl. Circle Console + Arc explorer | ✅ | see video plan in [docs/VIDEO_NOTES.md](docs/VIDEO_NOTES.md) |
| Public GitHub repo | ✅ | this repo |
| Circle Product Feedback writeup | ✅ | [docs/CIRCLE_FEEDBACK.md](docs/CIRCLE_FEEDBACK.md) |

---

## Architecture

```
┌──────────────────────┐        x402 nanopayment        ┌─────────────────┐
│  RequesterAgent      │ ────────── USDC ──────────────▶│  Broker A       │
│  (Gemini 3 Flash +   │                                │  (Gemini Flash) │
│   function calling)  │◀── service result + payment ───│                 │
└──────────┬───────────┘           receipt              └─────────────────┘
           │                                             (5 total brokers,
           │  giveFeedback()                              3 services,
           ▼                                              varied $/quality)
┌──────────────────────┐
│  ReputationRegistry  │   ERC-8004 on Arc testnet
│  (on-chain)          │
└──────────────────────┘
```

- **5 brokers** at varied price/quality tiers across 3 services
  (sentiment, price-lookup, summarize). Each is a process on its own port
  with `createGatewayMiddleware(...)` serving an x402 endpoint.
- **Requester agent** uses Gemini 3 Flash with two tools — `list_brokers` and
  `pay_broker`. It reads on-chain reputation before selecting.
- **Judge** (Gemini 3 Flash) grades the broker's output on [0,1].
- **Feedback** is posted to ERC-8004 ReputationRegistry through the same
  Circle-managed buyer wallet; future picks read it.

---

## Setup

**1. Install**
```bash
npm install
```

**2. Configure** — copy `.env.example` to `.env` and fill in:
- `GOOGLE_GENERATIVE_AI_API_KEY` from https://aistudio.google.com/apikey
- `CIRCLE_API_KEY` from https://console.circle.com/
- 5 fresh broker private keys (brokers sign their own ERC-8004 registrations):
  ```bash
  node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"
  ```

**3. Bootstrap the Circle-managed buyer wallet**
```bash
npx tsx scripts/bootstrap-circle-wallet.ts
# writes CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_SET_ID, CIRCLE_WALLET_ID,
# CIRCLE_WALLET_ADDRESS into .env. Saves recovery file in ./output/.
```

**4. Fund via faucet**
```
https://faucet.circle.com → Arc testnet → paste CIRCLE_WALLET_ADDRESS
```

**5. Deposit into Gateway (enables x402 batched payments)**
```bash
npx tsx scripts/deposit-to-gateway.ts 5
```

**6. Register brokers on ERC-8004** (one-time, cached to disk)
```bash
npx tsx scripts/register-brokers.ts
```
This script tops up broker gas from the Circle-managed buyer wallet if needed.

---

## Running the demo

**Start the 5 brokers** (leave running in one terminal)
```bash
npm run brokers
```

**In another terminal:**

- **50-tx proof** — the hackathon's hard requirement, now shown in a Textual UI
  ```bash
  npm run fifty
  ```
- **50-tx CLI fallback** — raw terminal output + JSON receipt
  ```bash
  npm run fifty:cli
  ```

- **Full agent demo** — end-to-end user-task → broker selection → payment
  → judge → reputation feedback
  ```bash
  npm run demo          # full 50 tasks (slow, LLM-bound)
  DEMO_N=10 npm run demo  # 10 tasks for the video
  ```

- **Textual live UI** — same demo flow, but split into Requester / Broker /
  Judge / Chain panels for recording
  ```bash
  uv venv
  uv pip install -r requirements-textual.txt
  python3 scripts/textual_demo.py --tasks 3
  ```
  Keys: `y` copies the latest Arc tx link, `o` opens it in the browser.

- **Web demo (Next.js 16 + Tailwind 4)** — browser UI suitable for a hosted
  application URL
  ```bash
  npm run brokers
  npm run web:dev
  ```
  Then open `http://localhost:3000`.

  Notes:
  - The web app lives in `web/`.
  - Without `A2A_BACKEND_URL`, the web app uses its local TypeScript fallback.
  - With `A2A_BACKEND_URL`, the web app streams from the real Python
    PydanticAI + A2A backend in `backend/`.
  - Deploy the frontend to Vercel and the backend to Railway.
  - The broker seller endpoints must still be reachable from the backend.

For the submission video, keep the terminal as the main view, but also show:
- the Circle Developer Console transaction entry for the buyer wallet
- the corresponding Arc explorer verification

---

## Tests

Integration tests run against real Arc + real Gemini.

```bash
npm test
```

- `tests/critical-path.test.ts` — full register → pay → judge → feedback → re-read loop
- `tests/judge.test.ts` — judge grading calibration (sentiment, price-lookup)
- `tests/selection.test.ts` — reputation-driven broker selection

---

## Key files

| File | Role |
|---|---|
| `src/agents/requester.ts` | Requester agent: raw-REST Gemini function calling loop |
| `src/brokers/registry.ts` | The 5 brokers, their prices and quality |
| `src/brokers/seller-server.ts` | Express servers, x402 middleware, Gemini inference |
| `src/brokers/service-impl.ts` | Per-service Gemini prompts (sentiment, price, summarize) |
| `src/circle/circle-pay.ts` | **Circle-managed x402 payments** (signs via signTypedData API) |
| `src/circle/dev-wallet.ts` | Circle wallet helpers for transfers + contract execution |
| `src/circle/pay.ts` | Thin wrapper: routes agent payments through circle-pay |
| `src/circle/gemini-tools.ts` | Hand-rolled Gemini function-calling loop (faster than SDK) |
| `src/reputation/client.ts` | ERC-8004 reads and writes |
| `src/reputation/judge.ts` | Gemini 3 Flash judge |
| `src/demo/run.ts` | 50-query demo driver with summary |
| `scripts/fifty-tx.ts` | 50-tx proof script |
| `docs/MARGIN.md` | Margin argument |
| `docs/CIRCLE_FEEDBACK.md` | Circle Product Feedback writeup |

---

## Submission artifacts

- **Receipts:** `demo-output/fifty-tx-*.json` and `demo-output/run-*.json`
- **Buyer on Arc explorer:** https://testnet.arcscan.app/address/0x77a280cf6552ccc946204432c2d17941c4f41832
- **ERC-8004 agent IDs:**
  - Broker A (FastSent): 2424
  - Broker B (DeepSent): 2425
  - Broker C (QuickPrice): 2426
  - Broker D (SharpPrice): 2427
  - Broker E (Summarizer): 2428
- **Registries on Arc:**
  - IdentityRegistry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
  - ReputationRegistry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
