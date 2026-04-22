#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from fasta2a.client import A2AClient
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.google import GoogleModelSettings
from dotenv import dotenv_values


EVENT_PREFIX = "@@DEMO_EVENT@@"

BROKER_PORTS = {"A": 4101, "B": 4102, "C": 4103, "D": 4104, "E": 4105}
EXPLORER = "https://testnet.arcscan.app"
CHAIN_ID = 5042002


class TaskProfile(BaseModel):
    service: str
    complexity: str
    normalized_input: str
    reason: str


class BrokerAssessment(BaseModel):
    broker_id: str
    broker_name: str
    service: str
    fit_score: float
    reason: str


class BrokerDecision(BaseModel):
    broker_id: str
    reason: str


class JudgeScore(BaseModel):
    quality: float
    reason: str


def emit_event(event: dict[str, Any]) -> None:
    print(f"{EVENT_PREFIX} {json.dumps(event)}", flush=True)


def load_env_file(repo_root: Path) -> None:
    env_path = repo_root / ".env"
    if not env_path.exists():
        return
    for key, value in dotenv_values(env_path).items():
        if value is not None:
            os.environ.setdefault(key, value)
    if os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ["GOOGLE_GENERATIVE_AI_API_KEY"]
    os.environ.pop("GEMINI_API_KEY", None)


def run_json(repo_root: Path, *args: str) -> dict[str, Any]:
    result = subprocess.run(
        list(args),
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


async def poll_a2a_result(client: A2AClient, task_id: str, *, timeout_s: float = 30.0) -> dict[str, Any]:
    started = time.time()
    while time.time() - started < timeout_s:
        task = await client.get_task(task_id)
        state = task["result"]["status"]["state"]
        if state == "completed":
            return task
        if state in {"failed", "canceled"}:
            raise RuntimeError(f"A2A task {task_id} ended with state={state}")
        await asyncio.sleep(0.4)
    raise TimeoutError(f"A2A task {task_id} timed out")


async def get_broker_assessment(base_url: str, prompt: str) -> BrokerAssessment:
    client = A2AClient(base_url)
    try:
        response = await client.send_message(
            {
                "role": "user",
                "kind": "message",
                "message_id": str(uuid.uuid4()),
                "parts": [{"kind": "text", "text": prompt}],
            }
        )
        task_id = response["result"]["id"]
        task = await poll_a2a_result(client, task_id)
        data = task["result"]["artifacts"][0]["parts"][0]["data"]["result"]
        return BrokerAssessment.model_validate(data)
    finally:
        await client.http_client.aclose()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Experimental PydanticAI + A2A demo runner.")
    parser.add_argument("--tasks", type=int, default=1)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    load_env_file(repo_root)

    task_profile_agent = Agent(
        "google-gla:gemini-3-flash-preview",
        output_type=TaskProfile,
        model_settings=GoogleModelSettings(google_thinking_config={"thinking_level": "low"}),
        instructions=(
            "Classify the incoming task.\n"
            "Return service as one of: sentiment, price-lookup, summarize.\n"
            "Return complexity as one of: low, medium, high.\n"
            "normalized_input should be the exact payload that should be sent to the broker."
        ),
    )
    requester_agent = Agent(
        "google-gla:gemini-3-flash-preview",
        output_type=BrokerDecision,
        model_settings=GoogleModelSettings(google_thinking_config={"thinking_level": "low"}),
        instructions=(
            "Choose exactly one broker.\n"
            "Prefer matching service first, then stronger reputation and fit_score.\n"
            "When quality looks close, prefer the cheaper broker.\n"
            "Return broker_id and one short reason."
        ),
    )
    judge_agent = Agent(
        "google-gla:gemini-3-flash-preview",
        output_type=JudgeScore,
        model_settings=GoogleModelSettings(google_thinking_config={"thinking_level": "low"}),
        instructions=(
            "You are an objective judge evaluating an AI service output.\n"
            "Score quality from 0 to 1.\n"
            "Consider correctness, relevance, and JSON shape if expected."
        ),
    )

    state = run_json(repo_root, "npx", "tsx", "scripts/broker-state-json.ts")["brokers"]
    tasks = [
        "Classify sentiment: 'I absolutely love the new dashboard.'",
        "What is the USD price of SOL right now?",
        "Summarize this product update for a busy executive: Added role-based access control, audit logs, and CSV export.",
    ][: args.tasks]

    broker_procs: list[subprocess.Popen[str]] = []
    try:
        for broker in state:
            proc = subprocess.Popen(
                [
                    sys.executable,
                    str(repo_root / "scripts" / "a2a_broker_server.py"),
                    "--broker-id",
                    broker["id"],
                    "--port",
                    str(BROKER_PORTS[broker["id"]]),
                ],
                cwd=repo_root,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                text=True,
                env=os.environ.copy(),
            )
            broker_procs.append(proc)
        await asyncio.sleep(1.5)

        print("=" * 80)
        print("AGENT ECONOMY ON ARC — A2A + PYDANTICAI DEMO RUN")
        print("=" * 80)
        print(f"Tasks:  {len(tasks)}")
        print("Model:  gemini-3-flash-preview")
        print(f"Chain:  Arc testnet (id {CHAIN_ID})")
        print(f"Expl:   {EXPLORER}")
        print("=" * 80)
        emit_event(
            {
                "type": "run_started",
                "totalTasks": len(tasks),
                "model": "gemini-3-flash-preview",
                "chainId": CHAIN_ID,
                "explorer": EXPLORER,
            }
        )

        started_at = time.time()
        completed = 0
        total_spent = 0.0
        latencies: list[int] = []
        picks: dict[str, int] = {}

        for index, task in enumerate(tasks, start=1):
            task_started = time.time()
            print(f"\n[{index}/{len(tasks)}] {task}")
            emit_event({"type": "task_started", "index": index, "total": len(tasks), "task": task})

            profile = (await task_profile_agent.run(task)).output
            matching = [b for b in state if b["service"] == profile.service]
            emit_event(
                {
                    "type": "requester_snapshot",
                    "brokers": [
                        {
                            "id": b["id"],
                            "service": b["service"],
                            "price": b["price"],
                            "reputation": b["reputation"],
                        }
                        for b in state
                    ],
                }
            )

            assessment_prompt = (
                f"Task: {task}\n"
                f"Required service: {profile.service}\n"
                f"Complexity: {profile.complexity}\n"
                f"Normalized input: {profile.normalized_input}\n"
                "Assess how suitable you are for this task."
            )
            assessments = await asyncio.gather(
                *[
                    get_broker_assessment(
                        f"http://127.0.0.1:{BROKER_PORTS[broker['id']]}",
                        assessment_prompt,
                    )
                    for broker in matching
                ]
            )

            choice_prompt = (
                f"Task: {task}\n"
                f"Service: {profile.service}\n"
                f"Complexity: {profile.complexity}\n"
                f"Candidates:\n{json.dumps([a.model_dump() for a in assessments], indent=2)}\n"
                f"Current reputations:\n{json.dumps([{b['id']: b['reputation']} for b in matching], indent=2)}"
            )
            choice = (await requester_agent.run(choice_prompt)).output
            chosen = next(b for b in state if b["id"] == choice.broker_id)
            emit_event(
                {
                    "type": "broker_selected",
                    "brokerId": chosen["id"],
                    "brokerName": chosen["name"],
                    "service": chosen["service"],
                    "input": profile.normalized_input,
                }
            )

            paid = run_json(
                repo_root,
                "npx",
                "tsx",
                "scripts/pay-broker-json.ts",
                chosen["id"],
                profile.normalized_input,
            )
            paid_data = paid["paid"]["data"]
            emit_event(
                {
                    "type": "broker_response",
                    "brokerId": chosen["id"],
                    "brokerName": chosen["name"],
                    "service": chosen["service"],
                    "payer": paid_data["payment"]["payer"],
                    "amount": paid_data["payment"]["amount"],
                    "network": paid_data["payment"]["network"],
                    "outputPreview": paid_data["result"]["output"],
                }
            )

            judge = (
                await judge_agent.run(
                    f"Service type: {chosen['service']}\nTask: {task}\nBroker output: {paid_data['result']['output']}"
                )
            ).output
            emit_event(
                {
                    "type": "judge_score",
                    "brokerId": chosen["id"],
                    "quality": judge.quality,
                    "reason": judge.reason,
                }
            )

            feedback = run_json(
                repo_root,
                "npx",
                "tsx",
                "scripts/give-feedback-json.ts",
                chosen["id"],
                str(judge.quality),
            )
            emit_event(
                {
                    "type": "feedback_written",
                    "brokerId": chosen["id"],
                    "txHash": feedback["txHash"],
                }
            )

            latency_ms = int((time.time() - task_started) * 1000)
            price_usd = float(chosen["price"].replace("$", ""))
            completed += 1
            total_spent += price_usd
            latencies.append(latency_ms)
            picks[chosen["id"]] = picks.get(chosen["id"], 0) + 1
            print(
                f"     → broker={chosen['id']}  price=${price_usd:.3f}  judge={judge.quality:.2f}  {latency_ms}ms"
            )
            print(f"     → feedback: {EXPLORER}/tx/{feedback['txHash']}")
            emit_event(
                {
                    "type": "task_completed",
                    "index": index,
                    "total": len(tasks),
                    "brokerId": chosen["id"],
                    "priceUsd": price_usd,
                    "judgeScore": judge.quality,
                    "latencyMs": latency_ms,
                }
            )

        avg_latency = round(sum(latencies) / max(1, len(latencies)))
        total_ms = int((time.time() - started_at) * 1000)
        emit_event(
            {
                "type": "run_summary",
                "completed": completed,
                "total": len(tasks),
                "totalUsdcSpent": total_spent,
                "avgLatencyMs": avg_latency,
                "picks": picks,
            }
        )

        print("\n" + "=" * 80)
        print("DEMO SUMMARY")
        print("=" * 80)
        print(f"Completed:        {completed}/{len(tasks)}")
        print(f"Total wall time:  {(total_ms / 1000):.1f}s")
        print(f"Avg latency:      {avg_latency}ms")
        print(f"Total USDC spent: ${total_spent:.4f}  (includes service fees only)")
    finally:
        for proc in broker_procs:
            proc.terminate()
        for proc in broker_procs:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    asyncio.run(main())
