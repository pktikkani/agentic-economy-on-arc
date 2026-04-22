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
Split terminal. Left pane:
```bash
npm run brokers
```
Show all 5 brokers come up on ports 3001–3005. Zoom into one health line so
the chain ID (`eip155:5042002`) is visible.

### 0:40 – 1:30  Agent run (live)
Right pane:
```bash
DEMO_N=3 npm run demo
```
- Freeze frame on the first task so the viewer sees:
  `[1/3] Classify sentiment: 'I absolutely love the new dashboard.'`
- Let it run through 3 tasks. Emphasize:
  - Broker chosen
  - `judge=<score>` line
  - `feedback: https://testnet.arcscan.app/tx/0x...` link

### 1:30 – 2:05  Arc explorer verification
Open the Circle Developer Console transaction list first and show the buyer
wallet transaction entry that corresponds to the demo run.

Then open one of the printed `feedback: https://testnet.arcscan.app/tx/0x...`
links in the browser. Show:
- Transaction status: Success
- To: `0x8004B663056A597Dffe9eCcC1965A193B7388713` (ReputationRegistry)
- Block / confirmation

Then open `https://testnet.arcscan.app/address/0x77a280cf6552ccc946204432c2d17941c4f41832`
(the buyer) and show the long list of outbound transactions.

### 2:05 – 2:40  50-tx throughput proof
Back to terminal:
```bash
npm run fifty
```
Let the counter climb. Highlight:
- `50/50 ok in ~89s`
- `Avg latency: ~1.8s per tx`
- `Total USDC: $0.150`

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
