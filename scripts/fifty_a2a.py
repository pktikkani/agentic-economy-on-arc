#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

from fasta2a.client import A2AClient
from dotenv import dotenv_values


EVENT_PREFIX = "@@FIFTY_EVENT@@"
NUM_TX = int(os.environ.get("NUM_TX", "50"))
EXPLORER = "https://testnet.arcscan.app"
A2A_URL = "http://127.0.0.1:4201"


def emit_event(event: dict[str, Any]) -> None:
    if os.environ.get("FIFTY_EMIT_EVENTS") != "1":
        return
    print(f"{EVENT_PREFIX} {json.dumps(event)}", flush=True)


async def poll_a2a_result(client: A2AClient, task_id: str, *, timeout_s: float = 30.0) -> dict[str, Any]:
    started = asyncio.get_running_loop().time()
    while asyncio.get_running_loop().time() - started < timeout_s:
        task = await client.get_task(task_id)
        state = task["result"]["status"]["state"]
        if state == "completed":
            return task["result"]["artifacts"][0]["parts"][0]["data"]["result"]
        if state in {"failed", "canceled"}:
            raise RuntimeError(f"A2A task {task_id} ended with state={state}")
        await asyncio.sleep(0.2)
    raise TimeoutError(f"A2A task {task_id} timed out")


async def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    env = {k: v for k, v in dotenv_values(repo_root / ".env").items() if v is not None}
    buyer = env.get("CIRCLE_WALLET_ADDRESS", "unknown")

    server_proc = subprocess.Popen(
        [sys.executable, str(repo_root / "scripts" / "a2a_fast_pay_server.py"), "--broker-id", "A", "--port", "4201"],
        cwd=repo_root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
        env=os.environ.copy(),
    )
    try:
        await asyncio.sleep(1.0)
        emit_event(
            {
                "type": "run_started",
                "total": NUM_TX,
                "sellerUrl": f"{A2A_URL} -> broker A /service-fast",
                "buyer": buyer,
                "buyerUrl": f"{EXPLORER}/address/{buyer}",
            }
        )
        print(f"Firing {NUM_TX} A2A-routed nanopayments at {A2A_URL} -> broker A /service-fast...")

        client = A2AClient(A2A_URL)
        results: list[dict[str, Any]] = []
        started = asyncio.get_running_loop().time()
        try:
            for i in range(NUM_TX):
                try:
                    response = await client.send_message(
                        {
                            "role": "user",
                            "kind": "message",
                            "message_id": str(uuid.uuid4()),
                            "parts": [{"kind": "text", "text": "settle one proof transaction"}],
                        }
                    )
                    task_id = response["result"]["id"]
                    result = await poll_a2a_result(client, task_id)
                    results.append(result)
                    print(f"[{i + 1}/{NUM_TX}] status={result['status']} ({result['dur_ms']}ms)")
                    emit_event(
                        {
                            "type": "tx_progress",
                            "index": i + 1,
                            "total": NUM_TX,
                            "status": result["status"],
                            "durMs": result["dur_ms"],
                            "ok": result["ok"],
                        }
                    )
                except Exception as error:
                    dur_ms = 0
                    results.append({"status": 0, "dur_ms": dur_ms, "ok": False, "note": str(error)})
                    print(f"[{i + 1}/{NUM_TX}] FAILED: {error}")
                    emit_event(
                        {
                            "type": "tx_progress",
                            "index": i + 1,
                            "total": NUM_TX,
                            "status": 0,
                            "durMs": dur_ms,
                            "ok": False,
                            "note": str(error),
                        }
                    )
        finally:
            await client.http_client.aclose()

        total_ms = round((asyncio.get_running_loop().time() - started) * 1000)
        ok_count = sum(1 for r in results if r["ok"])
        avg = round(sum(r["dur_ms"] for r in results if r["ok"]) / max(1, ok_count))
        total_spent = ok_count * 0.003
        outfile = repo_root / "demo-output" / f"fifty-a2a-{uuid.uuid4().hex}.json"
        outfile.parent.mkdir(parents=True, exist_ok=True)
        outfile.write_text(json.dumps({"summary": {
            "requirement": "50+ on-chain tx proof via A2A wrapper",
            "seller": f"{A2A_URL} -> broker A /service-fast",
            "buyer": buyer,
            "nTx": NUM_TX,
            "okCount": ok_count,
            "totalWallMs": total_ms,
            "avgLatencyMs": avg,
            "totalUsdcSpent": total_spent,
        }, "results": results}, indent=2))
        emit_event(
            {
                "type": "run_summary",
                "okCount": ok_count,
                "total": NUM_TX,
                "totalWallMs": total_ms,
                "avgLatencyMs": avg,
                "totalUsdcSpent": total_spent,
                "buyer": buyer,
                "buyerUrl": f"{EXPLORER}/address/{buyer}",
                "receipt": str(outfile),
            }
        )

        print("\n" + "=" * 80)
        print(f"50-TX PROOF (A2A): {ok_count}/{NUM_TX} ok in {(total_ms / 1000):.1f}s")
        print("=" * 80)
        print(f"Buyer:           {buyer}")
        print(f"Buyer on Arc:    {EXPLORER}/address/{buyer}")
        print(f"Avg latency:     {avg}ms per tx")
        print(f"Total USDC:      ${total_spent:.3f}")
        print(f"Receipt:         {outfile}")
    finally:
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()


if __name__ == "__main__":
    asyncio.run(main())
