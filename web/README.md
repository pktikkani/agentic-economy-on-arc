## Arc Agent-to-Agent Web Demo

This `web/` app is a Next.js 16 + Tailwind 4 frontend that exposes the
hackathon demo as a browser-based control room.

It mirrors the terminal demo stages:
- requester assessment
- broker selection
- sub-cent USDC payment
- judge scoring
- Arc reputation write
- 50-transaction throughput proof with one clickable Arc proof tx per item

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

## A2A backend

For the real PydanticAI + A2A protocol runtime, deploy `backend/` on Railway and
set this env var in Vercel:

```bash
A2A_BACKEND_URL=https://your-railway-service.up.railway.app
```

When `A2A_BACKEND_URL` is not set, the web app uses the local TypeScript
fallback so local development still works.

## Vercel

Use the repository root as the Vercel project root. The root `vercel.json`
installs and builds this `web/` app and points Vercel at `web/.next`.

Configure this Vercel env var:

```bash
A2A_BACKEND_URL=https://agentic-economy.prag-matic.com
```

The real Circle, Arc, Gemini, and broker env vars belong on the Railway backend,
not Vercel.

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
