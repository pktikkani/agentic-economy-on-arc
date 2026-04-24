# Railway A2A Backend

This service runs the real PydanticAI + A2A orchestration for the web demo.
The Next.js app can stay on Vercel and stream from this backend via
`A2A_BACKEND_URL`.

## Local

From the repo root:

```bash
npm install
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
npm run brokers
uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Then set this in `web/.env.local`:

```bash
A2A_BACKEND_URL=http://127.0.0.1:8000
```

## Railway

Use the repo root as the Railway project root.
The repo uses the root `Dockerfile` for Railway so the backend has Node,
`npx tsx`, Python, pip, and the A2A dependencies in one container. Do not
deploy only the `backend/` folder.

Builder:

```bash
DOCKERFILE
```

Start command:

```bash
python -m uvicorn backend.app:app --host 0.0.0.0 --port $PORT
```

Required env vars are the same Circle, Arc, Gemini, and broker settings used by
the existing demo. The broker URLs must be reachable from Railway. The demo
includes public default broker agent IDs for the already-registered Arc testnet
brokers; override with `BROKER_AGENT_IDS_JSON` or `BROKER_AGENT_ID_A` through
`BROKER_AGENT_ID_E` if you register a fresh set.
