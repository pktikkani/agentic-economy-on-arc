## Arc Agent-to-Agent Web Demo

This `web/` app is a Next.js 16 + Tailwind 4 frontend that exposes the
hackathon demo as a browser-based control room.

It mirrors the terminal demo stages:
- requester assessment
- broker selection
- sub-cent USDC payment
- judge scoring
- Arc reputation write
- 50-transaction throughput proof

## Local development

Start the seller brokers from the repo root:

```bash
cd ..
npm run brokers
```

Then start the web app from this directory:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app will load env vars from either:
- `web/.env.local`
- `../.env` (repo root)

See [.env.example](/Users/pavan/Documents/PycharmProjects/agenticEconomyHackathon/web/.env.example) for the full list.

## Vercel deployment

If you deploy this app to Vercel, configure:
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET`
- `CIRCLE_WALLET_ID`
- `CIRCLE_WALLET_ADDRESS`
- `ARC_RPC_URL`
- `ARC_CHAIN_ID`
- `ARC_EXPLORER`
- `BROKER_A_URL` … `BROKER_E_URL`
- `BROKER_AGENT_ID_A` … `BROKER_AGENT_ID_E`

Important:
- The Next app can be hosted on Vercel.
- The broker seller endpoints still need to be reachable from Vercel. For local
  dev that means `localhost:3001` … `3005`; for cloud deploy that means public
  broker URLs.

## Validation

```bash
npm run lint
npm run build
```

## Stack

- Next.js `16.2.4`
- React `19.2.5`
- Tailwind CSS `4.2.4`
- Circle Developer-Controlled Wallets
- viem
- Gemini 3 Flash
