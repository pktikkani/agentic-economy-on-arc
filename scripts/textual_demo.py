#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import webbrowser
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.widgets import Footer, Header, RichLog, Static


EVENT_PREFIX = "@@DEMO_EVENT@@ "


class AgenticTextualDemo(App[None]):
    CSS = """
    Screen {
        layout: vertical;
    }

    #summary {
        height: 7;
        border: round $accent;
        padding: 1;
        margin: 0 1;
    }

    #main {
        height: 1fr;
        layout: horizontal;
        margin: 0 1;
    }

    #left, #right {
        width: 1fr;
        height: 1fr;
        layout: vertical;
    }

    .panel {
        height: 1fr;
        margin: 0 1 1 0;
        layout: vertical;
    }

    #right .panel {
        margin: 0 0 1 1;
    }

    .panel-label {
        height: 1;
        padding: 0 1;
        color: $text;
        background: $accent-darken-2;
        text-style: bold;
    }

    .panel-log {
        height: 1fr;
        border: round $panel;
        padding: 0 1;
    }

    #raw-panel {
        height: 12;
        margin: 0 1 1 1;
    }

    #raw-label {
        background: $boost;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("r", "rerun", "Rerun"),
        Binding("y", "copy_tx_link", "Copy Tx Link"),
        Binding("o", "open_tx_link", "Open Tx"),
    ]

    def __init__(self, demo_n: int) -> None:
        super().__init__()
        self.demo_n = demo_n
        self.repo_root = Path(__file__).resolve().parents[1]
        self.demo_proc: subprocess.Popen[str] | None = None
        self.explorer = "https://testnet.arcscan.app"
        self.latest_tx_url: str | None = None
        self.run_state = {
            "task": "idle",
            "broker": "—",
            "judge": "—",
            "tx": "—",
            "progress": f"0/{demo_n}",
            "status": "Waiting to start",
        }

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static(id="summary")
        with Horizontal(id="main"):
            with Vertical(id="left"):
                with Vertical(classes="panel"):
                    yield Static("REQUESTER", classes="panel-label")
                    yield RichLog(id="requester", classes="panel-log", auto_scroll=True, markup=True, wrap=True)
                with Vertical(classes="panel"):
                    yield Static("BROKER", classes="panel-label")
                    yield RichLog(id="broker", classes="panel-log", auto_scroll=True, markup=True, wrap=True)
            with Vertical(id="right"):
                with Vertical(classes="panel"):
                    yield Static("JUDGE", classes="panel-label")
                    yield RichLog(id="judge", classes="panel-log", auto_scroll=True, markup=True, wrap=True)
                with Vertical(classes="panel"):
                    yield Static("CHAIN", classes="panel-label")
                    yield RichLog(id="chain", classes="panel-log", auto_scroll=True, markup=True, wrap=True)
        with Vertical(id="raw-panel"):
            yield Static("LIVE LOG / LINKS", id="raw-label", classes="panel-label")
            yield RichLog(id="raw", classes="panel-log", auto_scroll=True, markup=False, wrap=True)
        yield Footer()

    def on_mount(self) -> None:
        self._refresh_summary()
        self.run_demo()

    def action_rerun(self) -> None:
        self._stop_demo_proc()
        for panel_id in ("requester", "broker", "judge", "chain", "raw"):
            self.query_one(f"#{panel_id}", RichLog).clear()
        self.run_state = {
            "task": "idle",
            "broker": "—",
            "judge": "—",
            "tx": "—",
            "progress": f"0/{self.demo_n}",
            "status": "Restarting run",
        }
        self._refresh_summary()
        self.run_demo()

    def action_quit(self) -> None:
        self._stop_demo_proc()
        self.exit()

    def action_copy_tx_link(self) -> None:
        if not self.latest_tx_url:
            self.notify("No tx link yet.", severity="warning")
            return
        self.copy_to_clipboard(self.latest_tx_url)
        self.notify("Copied Arc tx link.")

    def action_open_tx_link(self) -> None:
        if not self.latest_tx_url:
            self.notify("No tx link yet.", severity="warning")
            return
        webbrowser.open(self.latest_tx_url)
        self.notify("Opened Arc tx link.")

    def on_unmount(self) -> None:
        self._stop_demo_proc()

    def _stop_demo_proc(self) -> None:
        if self.demo_proc and self.demo_proc.poll() is None:
            self.demo_proc.terminate()
            try:
                self.demo_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.demo_proc.kill()
        self.demo_proc = None

    def _refresh_summary(self) -> None:
        summary = self.query_one("#summary", Static)
        summary.update(
            "\n".join(
                [
                    f"[bold]Task:[/] {self.run_state['task']}",
                    f"[bold]Broker:[/] {self.run_state['broker']}    [bold]Judge:[/] {self.run_state['judge']}",
                    f"[bold]Feedback Tx:[/] {self.run_state['tx']}",
                    f"[bold]Progress:[/] {self.run_state['progress']}    [bold]Status:[/] {self.run_state['status']}",
                ]
            )
        )

    @work(thread=True, exclusive=True)
    def run_demo(self) -> None:
        raw = self.query_one("#raw", RichLog)

        broker_ports = [3001, 3002, 3003, 3004, 3005]
        healthy = 0
        for port in broker_ports:
            try:
                with urlopen(f"http://localhost:{port}/health", timeout=1) as response:
                    if response.status == 200:
                        healthy += 1
            except URLError:
                pass

        if healthy != len(broker_ports):
            self.call_from_thread(
                raw.write,
                f"Expected 5 brokers, found {healthy}. Start `npm run brokers` first.",
            )
            self.run_state["status"] = "Brokers are not running"
            self.call_from_thread(self._refresh_summary)
            return

        env = os.environ.copy()
        env["DEMO_N"] = str(self.demo_n)
        env["DEMO_EMIT_EVENTS"] = "1"
        proc = subprocess.Popen(
            ["npm", "run", "demo"],
            cwd=self.repo_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        self.demo_proc = proc

        assert proc.stdout is not None
        for line in proc.stdout:
            self.call_from_thread(self._handle_line, line.rstrip("\n"))

        code = proc.wait()
        self.demo_proc = None
        if code == 0:
            self.run_state["status"] = "Completed"
        else:
            self.run_state["status"] = f"Exited with code {code}"
        self.call_from_thread(self._refresh_summary)

    def _handle_line(self, line: str) -> None:
        if line.startswith(EVENT_PREFIX):
            payload = json.loads(line[len(EVENT_PREFIX) :])
            self._handle_event(payload)
            return
        self.query_one("#raw", RichLog).write(line)

    def _handle_event(self, event: dict) -> None:
        event_type = event["type"]
        requester = self.query_one("#requester", RichLog)
        broker = self.query_one("#broker", RichLog)
        judge = self.query_one("#judge", RichLog)
        chain = self.query_one("#chain", RichLog)

        if event_type == "run_started":
            self.explorer = event["explorer"]
            requester.write(
                f"[bold cyan]Run started[/] tasks={event['totalTasks']} model={event['model']} chain={event['chainId']}"
            )
            self.run_state["status"] = "Running"
        elif event_type == "task_started":
            requester.write(
                f"[bold cyan]Task {event['index']}/{event['total']}[/] {event['task']}"
            )
            self.run_state["task"] = event["task"]
            self.run_state["progress"] = f"{event['index'] - 1}/{event['total']}"
            self.run_state["broker"] = "selecting…"
            self.run_state["judge"] = "—"
            self.run_state["tx"] = "—"
        elif event_type == "requester_snapshot":
            snapshots = []
            for item in event["brokers"]:
                rep = item["reputation"]
                rep_text = "no rep" if rep is None else f"rep={rep['avg']:.2f} ({rep['count']})"
                snapshots.append(f"{item['id']} {item['service']} {item['price']} {rep_text}")
            requester.write("[cyan]Broker view:[/] " + " | ".join(snapshots))
        elif event_type == "broker_selected":
            broker.write(
                f"[bold yellow]Selected {event['brokerId']} {event['brokerName']}[/] service={event['service']} input={event['input'][:90]}"
            )
            self.run_state["broker"] = f"{event['brokerId']} {event['brokerName']}"
        elif event_type == "broker_response":
            payer = event.get("payer") or "?"
            amount = event.get("amount") or "?"
            network = event.get("network") or "?"
            broker.write(
                f"[yellow]Paid[/] amount={amount} payer={payer} net={network}\n{event.get('outputPreview') or ''}"
            )
        elif event_type == "judge_score":
            judge.write(
                f"[bold green]Score {event['quality']:.2f}[/] broker={event['brokerId']} reason={event['reason']}"
            )
            self.run_state["judge"] = f"{event['quality']:.2f}"
        elif event_type == "feedback_written":
            tx = event["txHash"]
            self.latest_tx_url = f"{self.explorer}/tx/{tx}"
            chain.write(
                "[bold magenta]Feedback written[/] "
                f"broker={event['brokerId']}\n{self.latest_tx_url}"
            )
            self.query_one("#raw", RichLog).write(f"Arc tx: {self.latest_tx_url}")
            self.run_state["tx"] = tx
        elif event_type == "task_completed":
            requester.write(
                f"[bold cyan]Completed[/] broker={event['brokerId']} price=${event['priceUsd']:.3f} latency={event['latencyMs']}ms"
            )
            self.run_state["progress"] = f"{event['index']}/{event['total']}"
        elif event_type == "task_failed":
            requester.write(
                f"[bold red]Failed[/] task {event['index']}/{event['total']} error={event['error']}"
            )
            self.run_state["status"] = "Task failed"
        elif event_type == "run_summary":
            chain.write(
                f"[bold magenta]Summary[/] completed={event['completed']}/{event['total']} spent=${event['totalUsdcSpent']:.4f} avg={event['avgLatencyMs']}ms"
            )
            self.run_state["status"] = "Completed"
        self._refresh_summary()


def main() -> None:
    parser = argparse.ArgumentParser(description="Textual frontend for the agentic economy demo.")
    parser.add_argument("--tasks", type=int, default=3, help="How many demo tasks to run.")
    args = parser.parse_args()
    app = AgenticTextualDemo(demo_n=args.tasks)
    app.run()


if __name__ == "__main__":
    try:
        main()
    except ModuleNotFoundError as error:
        if error.name == "textual":
            print(
                "Textual is not installed. Install it with `pip install textual` "
                "or use `python3 -m pip install -r requirements-textual.txt`.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        raise
