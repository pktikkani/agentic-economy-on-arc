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
The repo pins Railway/Nixpacks to Node 22 and Python 3.12 through
`package.json` and `nixpacks.toml`; do not deploy only the `backend/` folder.

Build command:

```bash
pip install -r backend/requirements.txt
```

Nixpacks install command:

```bash
npm ci --omit=dev
```

Start command:

```bash
uvicorn backend.app:app --host 0.0.0.0 --port $PORT
```

Required env vars are the same Circle, Arc, Gemini, and broker settings used by
the existing demo. The broker URLs must be reachable from Railway.
