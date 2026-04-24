# Video Capture Notes — 3-Minute Demo

Goal: show judges the end-to-end flow, with Arc Block Explorer verification, in under 3 minutes. The hard requirements this video must demonstrate:

1. USDC transaction executed via the Circle Developer Console flow
2. Verification of that transaction on the Arc Block Explorer
3. 50+ on-chain transaction throughput in the session

## Suggested run-sheet (3:00 total)

### 0:00 – 0:15  Intro card
A single full-screen title card with:
> **Agent-to-Agent Marketplace on Arc**
> Reputation-weighted broker selection · USDC nanopayments · Arc testnet

### 0:15 – 0:40  Setup shot
Backend repo terminal:
```bash
npm run brokers
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Web repo terminal:
```bash
npm run dev
```

Open the web UI and show it is connected to Arc testnet / Railway backend.

### 0:40 – 1:30  Agent run (live)
Click **Run A2A Demo** in the web UI.

Emphasize:
- requester assessment
- selected broker
- judge score
- `Arc feedback tx` link

### 1:30 – 2:05  Arc explorer verification
Open the Circle Developer Console transaction list first and show the buyer
wallet transaction entry that corresponds to the demo run.

Then open one of the web UI `Arc feedback tx` links in the browser. Show:
- Transaction status: Success
- To: `0x8004B663056A597Dffe9eCcC1965A193B7388713` (ReputationRegistry)
- Block / confirmation

Then open `https://testnet.arcscan.app/address/0x77a280cf6552ccc946204432c2d17941c4f41832`
(the buyer) and show the long list of outbound transactions.

### 2:05 – 2:40  50-tx throughput proof
Back to the web UI. Click **Run 50-Tx Proof**.

Let the counter climb. Highlight:
- `50/50 ok`
- average latency
- service spend around `$0.150`
- individual Arc proof tx links in the 50-tx log

Small zoom on the final summary box.

### 2:40 – 3:00  Outro
Split card:
- Left: "$0.15 revenue · 50 settlements · 89 seconds · Arc"
- Right: "Ethereum mainnet gas equivalent: **$25 to $250**"
- Bottom line: "Sub-cent per-call pricing is only viable on stablecoin-native rails."

End with repo URL.

## Things NOT to show
- Private keys (`.env`). Mask if it ever appears.
- The `.cache/broker-ids.json` file.
- Any Gemini API key.
- Raw stack traces from earlier debug runs.

## Capture tips
- Screen recorder at 1080p or higher, 30 fps is enough.
- Use a monospace terminal font at readable size (14pt+).
- Do one practice take with the real commands so you can predict which
  `arcscan.app` tab will have the best visual.
- Editing: a 2-3× speed bump on the `npm run fifty` section is acceptable
  — show the counter moving, cut to summary.
