#!/usr/bin/env python3
from __future__ import annotations

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
from textual.containers import Vertical
from textual.widgets import Footer, Header, ProgressBar, RichLog, Static


EVENT_PREFIX = "@@FIFTY_EVENT@@ "


class FiftyTextualDemo(App[None]):
    TITLE = "Arc Nanopayment Throughput Proof"

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

    #progress-panel {
        height: 5;
        margin: 0 1 1 1;
        layout: vertical;
    }

    .panel-label {
        height: 1;
        padding: 0 1;
        color: $text;
        background: $accent-darken-2;
        text-style: bold;
    }

    #proof-label {
        background: $boost;
    }

    .panel-log {
        height: 1fr;
        border: round $panel;
        padding: 0 1;
        margin: 0 1 1 1;
    }

    #progress {
        height: 3;
        border: round $panel;
        margin: 0 1 1 1;
    }

    #proof {
        height: 1fr;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("r", "rerun", "Rerun"),
        Binding("y", "copy_proof_link", "Copy Proof Link"),
        Binding("o", "open_proof_link", "Open Proof"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.repo_root = Path(__file__).resolve().parents[1]
        self.proc: subprocess.Popen[str] | None = None
        self.latest_proof_url: str | None = None
        self.ok_count = 0
        self.run_state = {
            "buyer": "—",
            "progress": "0/50",
            "ok": "0",
            "avg": "—",
            "spent": "—",
            "status": "Waiting to start",
        }

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static(id="summary")
        with Vertical(id="progress-panel"):
            yield Static("50-TX PROOF", classes="panel-label")
            yield ProgressBar(total=50, id="progress", show_eta=False)
        yield Static("PROOF / LOG", id="proof-label", classes="panel-label")
        yield RichLog(id="proof", classes="panel-log", auto_scroll=True, markup=True, wrap=True)
        yield Footer()

    def on_mount(self) -> None:
        self._refresh_summary()
        self.run_proof()

    def action_quit(self) -> None:
        self._stop_proc()
        self.exit()

    def action_rerun(self) -> None:
        self._stop_proc()
        self.query_one("#proof", RichLog).clear()
        self.query_one("#progress", ProgressBar).update(progress=0, total=50)
        self.latest_proof_url = None
        self.ok_count = 0
        self.run_state = {
            "buyer": "—",
            "progress": "0/50",
            "ok": "0",
            "avg": "—",
            "spent": "—",
            "status": "Restarting run",
        }
        self._refresh_summary()
        self.run_proof()

    def action_copy_proof_link(self) -> None:
        if not self.latest_proof_url:
            self.notify("No proof link yet.", severity="warning")
            return
        self.copy_to_clipboard(self.latest_proof_url)
        self.notify("Copied Arc proof link.")

    def action_open_proof_link(self) -> None:
        if not self.latest_proof_url:
            self.notify("No proof link yet.", severity="warning")
            return
        webbrowser.open(self.latest_proof_url)
        self.notify("Opened Arc proof link.")

    def on_unmount(self) -> None:
        self._stop_proc()

    def _stop_proc(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def _refresh_summary(self) -> None:
        self.query_one("#summary", Static).update(
            "\n".join(
                [
                    f"[bold]Buyer:[/] {self.run_state['buyer']}",
                    f"[bold]Progress:[/] {self.run_state['progress']}    [bold]OK:[/] {self.run_state['ok']}",
                    f"[bold]Avg:[/] {self.run_state['avg']}    [bold]Spent:[/] {self.run_state['spent']}",
                    f"[bold]Status:[/] {self.run_state['status']}",
                ]
            )
        )

    @work(thread=True, exclusive=True)
    def run_proof(self) -> None:
        proof = self.query_one("#proof", RichLog)

        try:
            with urlopen("http://localhost:3001/health", timeout=1) as response:
                if response.status != 200:
                    raise URLError("Broker A health check failed")
        except URLError:
            self.call_from_thread(
                proof.write,
                "Broker A is not running. Start `npm run brokers` first.",
            )
            self.run_state["status"] = "Broker A is not running"
            self.call_from_thread(self._refresh_summary)
            return

        env = os.environ.copy()
        env["FIFTY_EMIT_EVENTS"] = "1"
        proc = subprocess.Popen(
            ["npm", "run", "fifty:cli"],
            cwd=self.repo_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        self.proc = proc

        assert proc.stdout is not None
        for line in proc.stdout:
            self.call_from_thread(self._handle_line, line.rstrip("\n"))

        code = proc.wait()
        self.proc = None
        self.run_state["status"] = "Completed" if code == 0 else f"Exited with code {code}"
        self.call_from_thread(self._refresh_summary)

    def _handle_line(self, line: str) -> None:
        if line.startswith(EVENT_PREFIX):
            self._handle_event(json.loads(line[len(EVENT_PREFIX) :]))
            return
        if line.startswith("[") and "/" in line and "status=" in line:
            return
        self.query_one("#proof", RichLog).write(line)

    def _handle_event(self, event: dict) -> None:
        proof = self.query_one("#proof", RichLog)
        progress = self.query_one("#progress", ProgressBar)

        if event["type"] == "run_started":
            self.run_state["buyer"] = event["buyer"]
            self.latest_proof_url = event["buyerUrl"]
            self.run_state["status"] = "Running"
            self.ok_count = 0
            progress.update(total=event["total"], progress=0)
            proof.write(f"[bold cyan]Run started[/] seller={event['sellerUrl']}")
            proof.write(f"[cyan]Arc proof link:[/] {event['buyerUrl']}")
        elif event["type"] == "tx_progress":
            progress.update(progress=event["index"])
            self.run_state["progress"] = f"{event['index']}/{event['total']}"
            if event["ok"]:
                self.ok_count += 1
            self.run_state["ok"] = str(self.ok_count)
            status_text = "ok" if event["ok"] else "failed"
            note = f" note={event['note']}" if event.get("note") else ""
            proof.write(
                f"[bold yellow][{event['index']}/{event['total']}][/]"
                f" status={event['status']} {status_text} ({event['durMs']}ms){note}"
            )
        elif event["type"] == "run_summary":
            self.run_state["progress"] = f"{event['total']}/{event['total']}"
            self.run_state["ok"] = str(event["okCount"])
            self.run_state["avg"] = f"{event['avgLatencyMs']}ms"
            self.run_state["spent"] = f"${event['totalUsdcSpent']:.3f}"
            self.latest_proof_url = event["buyerUrl"]
            proof.write(
                "[bold magenta]Summary[/] "
                f"{event['okCount']}/{event['total']} ok, avg={event['avgLatencyMs']}ms, "
                f"spent=${event['totalUsdcSpent']:.3f}"
            )
            proof.write(f"[magenta]Buyer on Arc:[/] {event['buyerUrl']}")
            proof.write(f"[magenta]Receipt:[/] {event['receipt']}")
            self.run_state["status"] = "Completed"

        self._refresh_summary()


def main() -> None:
    app = FiftyTextualDemo()
    app.run()


if __name__ == "__main__":
    try:
        main()
    except ModuleNotFoundError as error:
        if error.name == "textual":
            print(
                "Textual is not installed. Install it with `uv pip install -r requirements-textual.txt`.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        raise
