"use client";

import { useMemo, useRef, useState } from "react";

type BrokerSnapshot = {
  id: string;
  name: string;
  service: string;
  price: string;
  reputation: { count: number; avg: number } | null;
};

type DemoResult = {
  index: number;
  total: number;
  task: string;
  broker: string;
  judgeScore: number;
  priceUsd: number;
  latencyMs: number;
  txHash: string;
};

type DemoState = {
  task: string;
  broker: string;
  judge: string;
  feedbackTx: string;
  results: DemoResult[];
  proofLinks: string[];
  requester: string[];
  brokerPanel: string[];
  judgePanel: string[];
  chainPanel: string[];
  logs: string[];
  status: string;
};

type FiftyState = {
  runId: string;
  progress: number;
  total: number;
  ok: number;
  proofTxs: string[];
  buyer: string;
  buyerUrl: string;
  sellerUrl: string;
  avgLatency: string;
  spent: string;
  logs: string[];
  receipt: string;
  status: string;
};

const initialDemoState: DemoState = {
  task: "Waiting for demo run",
  broker: "Not selected",
  judge: "Pending",
  feedbackTx: "",
  results: [],
  proofLinks: [],
  requester: [],
  brokerPanel: [],
  judgePanel: [],
  chainPanel: [],
  logs: [],
  status: "Idle",
};

const initialFiftyState: FiftyState = {
  runId: "",
  progress: 0,
  total: 50,
  ok: 0,
  proofTxs: [],
  buyer: "Not loaded",
  buyerUrl: "",
  sellerUrl: "",
  avgLatency: "-",
  spent: "-",
  logs: [],
  receipt: "",
  status: "Idle",
};

function clip(text: string, max = 220) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function shortHash(text: string, head = 10, tail = 8) {
  if (text.length <= head + tail + 3) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function repLabel(rep: BrokerSnapshot["reputation"]) {
  if (!rep) return "no rep";
  return `rep=${rep.avg.toFixed(2)} (${rep.count})`;
}

function fmtUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

function linkifiedText(text: string) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlPattern);
  return parts.map((part, index) => {
    if (!part.match(urlPattern)) return <span key={`${part}-${index}`}>{part}</span>;
    return (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="break-all text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 transition hover:text-white"
      >
        {part}
      </a>
    );
  });
}

function normalizeAssessment(assessment: {
  brokerId?: string;
  broker_id?: string;
  brokerName?: string;
  broker_name?: string;
  fitScore?: number;
  fit_score?: number;
  reason?: string;
}) {
  return {
    brokerId: assessment.brokerId ?? assessment.broker_id ?? "?",
    brokerName: assessment.brokerName ?? assessment.broker_name ?? "Unknown",
    fitScore: assessment.fitScore ?? assessment.fit_score ?? 0,
    reason: assessment.reason ?? "",
  };
}

export function DemoConsole() {
  const [tasks, setTasks] = useState(1);
  const [demo, setDemo] = useState<DemoState>(initialDemoState);
  const [fifty, setFifty] = useState<FiftyState>(initialFiftyState);
  const [activeRun, setActiveRun] = useState<"demo" | "fifty" | null>(null);
  const [copiedLabel, setCopiedLabel] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    window.setTimeout(() => setCopiedLabel(""), 1500);
  }

  function stopCurrentRun() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setActiveRun(null);
  }

  function startDemo() {
    stopCurrentRun();
    setDemo({
      ...initialDemoState,
      status: "Running A2A demo",
      requester: ["A2A assessment pipeline booted"],
      logs: ["Starting live A2A orchestration run"],
    });
    const source = new EventSource(`/api/demo/run?tasks=${tasks}`);
    eventSourceRef.current = source;
    setActiveRun("demo");
    source.onmessage = (message) => {
      const payload = JSON.parse(message.data);
      if (payload.type === "done") {
        setActiveRun(null);
        source.close();
        return;
      }
      if (payload.type === "error") {
        setDemo((state) => ({
          ...state,
          status: `Error: ${payload.message}`,
          logs: [...state.logs, `error: ${payload.message}`],
        }));
        setActiveRun(null);
        source.close();
        return;
      }

      setDemo((state) => {
        switch (payload.type) {
          case "run_started":
            return {
              ...state,
              status: `Connected to Arc testnet (${payload.chainId})`,
              requester: [
                `A2A assessment started with ${payload.model}`,
                `Arc explorer: ${payload.explorer}`,
              ],
            };
          case "task_started":
            return {
              ...state,
              task: payload.task,
              broker: "Selecting broker",
              judge: "Pending",
              feedbackTx: "",
              brokerPanel: [],
              judgePanel: [],
              chainPanel: [],
              logs: [...state.logs, `task ${payload.index}/${payload.total}: ${payload.task}`],
            };
          case "requester_snapshot":
            return {
              ...state,
              requester: [
                "A2A broker assessments",
                ...payload.brokers.map(
                  (broker: BrokerSnapshot) =>
                    `${broker.id} ${broker.name} ${broker.service} ${broker.price} ${repLabel(
                      broker.reputation
                    )}`
                ),
              ],
            };
          case "a2a_assessment_started":
            return {
              ...state,
              requester: [
                ...state.requester,
                `Target service=${payload.service}, complexity=${payload.complexity}, candidates=${payload.count}`,
              ],
            };
          case "a2a_assessment_results":
            return {
              ...state,
              requester: [
                ...state.requester,
                ...payload.assessments.map((raw: Parameters<typeof normalizeAssessment>[0]) => {
                  const assessment = normalizeAssessment(raw);
                  return (
                    `${assessment.brokerId} ${assessment.brokerName} fit=${assessment.fitScore.toFixed(
                      2
                    )} ${clip(assessment.reason, 90)}`
                  );
                }),
              ],
            };
          case "a2a_decision":
            return {
              ...state,
              broker: `${payload.brokerId} ${payload.brokerName}`,
              requester: [...state.requester, `Decision: ${payload.reason}`],
              logs: [...state.logs, `selected ${payload.brokerId} ${payload.brokerName}`],
            };
          case "broker_selected":
            return {
              ...state,
              brokerPanel: [
                `Selected ${payload.brokerId} ${payload.brokerName}`,
                `service=${payload.service}`,
                `input=${payload.input}`,
              ],
            };
          case "broker_response":
            return {
              ...state,
              brokerPanel: [
                ...state.brokerPanel,
                `payer=${payload.payer}`,
                `amount=${payload.amount} network=${payload.network}`,
                clip(payload.outputPreview, 240),
              ],
            };
          case "judge_score":
            return {
              ...state,
              judge: payload.quality.toFixed(2),
              judgePanel: [`score=${payload.quality.toFixed(2)}`, payload.reason],
            };
          case "feedback_written":
            return {
              ...state,
              feedbackTx: payload.txHash,
              chainPanel: [
                `Arc reputation feedback recorded for broker=${payload.brokerId} score=${payload.quality.toFixed(
                  2
                )}`,
                `Arc tx proof link: https://testnet.arcscan.app/tx/${payload.txHash}`,
              ],
              proofLinks: [...state.proofLinks, `https://testnet.arcscan.app/tx/${payload.txHash}`],
              logs: [
                ...state.logs,
                `task feedback proof ${state.proofLinks.length + 1}: https://testnet.arcscan.app/tx/${payload.txHash}`,
              ],
            };
          case "task_completed":
            return {
              ...state,
              status: `Completed ${payload.index}/${payload.total}`,
              results: [
                ...state.results.filter((result) => result.index !== payload.index),
                {
                  index: payload.index,
                  total: payload.total,
                  task: state.task,
                  broker: state.broker,
                  judgeScore: payload.judgeScore,
                  priceUsd: payload.priceUsd,
                  latencyMs: payload.latencyMs,
                  txHash: state.feedbackTx,
                },
              ].sort((a, b) => a.index - b.index),
              logs: [
                ...state.logs,
                `completed ${payload.index}/${payload.total} broker=${payload.brokerId} spent=${fmtUsd(
                  payload.priceUsd
                )} judge=${payload.judgeScore.toFixed(2)} latency=${payload.latencyMs}ms`,
              ],
            };
          case "run_summary":
            return {
              ...state,
              status: `Run complete ${payload.completed}/${payload.total}`,
              chainPanel: [
                ...state.chainPanel,
                `Arc run summary completed=${payload.completed}/${payload.total} spent=${fmtUsd(
                  payload.totalUsdcSpent
                )} avg=${payload.avgLatencyMs}ms`,
                payload.receipt ? `receipt=${payload.receipt}` : "",
              ].filter(Boolean),
              logs: [...state.logs, payload.receipt ? `demo receipt: ${payload.receipt}` : ""].filter(Boolean),
            };
          default:
            return state;
        }
      });
    };
  }

  function startFifty() {
    stopCurrentRun();
    setFifty({
      ...initialFiftyState,
      status: "Running throughput proof",
      logs: ["Starting 50-transaction A2A throughput proof"],
    });
    const source = new EventSource("/api/fifty/run?total=50");
    eventSourceRef.current = source;
    setActiveRun("fifty");
    source.onmessage = (message) => {
      const payload = JSON.parse(message.data);
      if (payload.type === "done") {
        setActiveRun(null);
        source.close();
        return;
      }
      if (payload.type === "error") {
        setFifty((state) => ({
          ...state,
          status: `Error: ${payload.message}`,
          logs: [...state.logs, `error: ${payload.message}`],
        }));
        setActiveRun(null);
        source.close();
        return;
      }

      setFifty((state) => {
        switch (payload.type) {
          case "fifty_started":
            return {
              ...state,
              runId: payload.runId ?? "",
              total: payload.total,
              buyer: payload.buyer,
              buyerUrl: payload.buyerUrl,
              sellerUrl: payload.sellerUrl,
              status: "Proof run in progress",
              logs: [
                ...state.logs,
                payload.runId ? `run id=${payload.runId}` : "",
                `seller=${payload.sellerUrl}`,
                `buyer=${payload.buyer}`,
                `buyer address on arc: ${payload.buyerUrl}`,
              ].filter(Boolean),
            };
          case "tx_progress":
            return {
              ...state,
              progress: payload.index,
              ok: state.ok + (payload.ok ? 1 : 0),
              proofTxs: payload.proofTxHash ? [...state.proofTxs, payload.proofTxHash] : state.proofTxs,
              logs: [
                ...state.logs,
                `[${payload.index}/${payload.total}] status=${payload.status} ${
                  payload.ok ? "ok" : "failed"
                } (${payload.durMs}ms)${payload.note ? ` ${payload.note}` : ""}`,
                payload.proofTxHash ? `arc proof tx ${payload.index}: https://testnet.arcscan.app/tx/${payload.proofTxHash}` : "",
              ].filter(Boolean),
            };
          case "fifty_summary":
            return {
              ...state,
              progress: payload.total,
              ok: payload.okCount,
              proofTxs: payload.proofTxHashes ?? state.proofTxs,
              avgLatency: `${payload.avgLatencyMs}ms`,
              spent: fmtUsd(payload.totalUsdcSpent),
              buyer: payload.buyer,
              buyerUrl: payload.buyerUrl,
              receipt: payload.receipt ?? "",
              runId: payload.runId ?? state.runId,
              status: `Proof complete ${payload.okCount}/${payload.total}`,
              logs: [
                ...state.logs,
                payload.runId ? `run id=${payload.runId}` : "",
                `summary ${payload.okCount}/${payload.total} wall=${payload.totalWallMs}ms avg=${payload.avgLatencyMs}ms`,
                `on-chain proof txs=${payload.onchainProofCount ?? state.proofTxs.length}`,
                `buyer address on arc: ${payload.buyerUrl}`,
                payload.receipt ? `receipt: ${payload.receipt}` : "",
              ],
            };
          default:
            return state;
        }
      });
    };
  }

  const progressPct = useMemo(() => {
    if (!fifty.total) return 0;
    return Math.round((fifty.progress / fifty.total) * 100);
  }, [fifty.progress, fifty.total]);
  const demoTxUrl = demo.feedbackTx ? `https://testnet.arcscan.app/tx/${demo.feedbackTx}` : "";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
      <header className="grid gap-6 rounded-[1.75rem] border border-white/12 bg-[linear-gradient(125deg,rgba(255,184,76,0.16),rgba(7,15,30,0.95)_34%,rgba(5,11,24,0.98)_100%)] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.42)] lg:rounded-[2rem] lg:p-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
          <div className="max-w-4xl">
            <p className="mb-3 inline-flex max-w-full rounded-full border border-amber-300/30 bg-amber-200/10 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-amber-200/85 sm:text-xs">
              Next.js A2A Demo Surface
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl xl:text-[3.45rem] xl:leading-[1.02]">
              Arc Agent-to-Agent Marketplace
            </h1>
            <p className="mt-4 max-w-3xl text-pretty text-sm leading-7 text-slate-300 md:text-base">
              A web-native control room for the same broker selection, sub-cent USDC payment, judge scoring, and Arc
              reputation write you already proved in the terminal demo.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] xl:gap-4">
            <label className="grid min-w-0 gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 lg:rounded-3xl">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Demo Tasks</span>
              <input
                type="number"
                min={1}
                value={tasks}
                onChange={(event) => setTasks(Math.max(1, Number(event.target.value) || 1))}
                className="min-w-0 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-300/45"
              />
            </label>

            <button
              onClick={startDemo}
              disabled={activeRun !== null}
              className="min-w-0 rounded-2xl border border-amber-300/25 bg-[linear-gradient(145deg,rgba(245,190,79,0.92),rgba(181,135,32,0.94))] px-5 py-4 text-left text-sm font-semibold text-slate-950 shadow-[0_18px_30px_rgba(245,158,11,0.18)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 lg:rounded-3xl"
            >
              <span className="block text-[11px] uppercase tracking-[0.24em] text-slate-900/70">Primary Run</span>
              <span className="mt-2 block text-lg">Run A2A Demo</span>
              <span className="mt-2 block text-xs font-medium text-slate-900/75">
                Requester → broker → judge → Arc
              </span>
            </button>

            <button
              onClick={startFifty}
              disabled={activeRun !== null}
              className="min-w-0 rounded-2xl border border-cyan-400/25 bg-[linear-gradient(145deg,rgba(104,198,224,0.92),rgba(70,126,156,0.98))] px-5 py-4 text-left text-sm font-semibold text-slate-950 shadow-[0_18px_30px_rgba(56,189,248,0.15)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 lg:rounded-3xl"
            >
              <span className="block text-[11px] uppercase tracking-[0.24em] text-slate-900/70">Proof Run</span>
              <span className="mt-2 block text-lg">Run 50-Tx Proof</span>
              <span className="mt-2 block text-xs font-medium text-slate-900/75">
                High-frequency sub-cent throughput
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:self-start">
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 lg:rounded-3xl">
            <a
              className="rounded-full border border-white/10 px-4 py-2 text-center transition hover:border-amber-300/40 hover:text-white"
              href="https://console.circle.com/wallets/dev/transactions"
              target="_blank"
              rel="noreferrer"
            >
              Open Circle Console
            </a>
            <a
              className="rounded-full border border-white/10 px-4 py-2 text-center transition hover:border-amber-300/40 hover:text-white"
              href="https://testnet.arcscan.app"
              target="_blank"
              rel="noreferrer"
            >
              Open Arc Explorer
            </a>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 lg:rounded-3xl">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Run State</span>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-semibold text-white">{activeRun ?? "idle"}</p>
                <p className="mt-1 line-clamp-3 text-sm text-slate-300">
                  {activeRun === "fifty" ? fifty.status : demo.status}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">
                {activeRun ? "live" : "standby"}
              </span>
            </div>
            {copiedLabel ? (
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-emerald-300">{copiedLabel} copied</p>
            ) : null}
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.15fr_0.75fr_0.65fr_1.25fr]">
        <MetricCard label="Task" value={demo.task} accent="amber" />
        <MetricCard label="Broker" value={demo.broker} accent="orange" />
        <MetricCard label="Judge" value={demo.judge} accent="lime" valueClassName="font-mono text-3xl" />
        <MetricCard
          label="Arc Feedback Tx"
          value={demo.feedbackTx ? shortHash(demo.feedbackTx, 14, 10) : "Pending"}
          accent="cyan"
          href={demoTxUrl || undefined}
          mono
          footer={
            demo.feedbackTx ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionChip href={demoTxUrl}>Open tx</ActionChip>
                <ActionChip onClick={() => copyText(demo.feedbackTx, "Arc tx")}>Copy hash</ActionChip>
                <ActionChip onClick={() => copyText(demoTxUrl, "Arc tx URL")}>Copy URL</ActionChip>
              </div>
            ) : null
          }
        />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] lg:rounded-[1.75rem] lg:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-amber-200">A2A Task History</p>
            <p className="mt-1 text-sm text-slate-400">
              One card per completed task, each with its own Arc reputation proof transaction.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
            {demo.results.length}/{tasks} complete
          </span>
        </div>

        {demo.results.length ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {demo.results.map((result) => (
              <TaskResultCard
                key={`${result.index}-${result.txHash}`}
                result={result}
                onCopy={(text, label) => void copyText(text, label)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[1.2rem] border border-white/8 bg-black/25 p-4 text-sm text-slate-400">
            Run more than one A2A task to see individual broker decisions and Arc proof links here.
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="REQUESTER">
          {demo.requester.length ? demo.requester.join("\n") : "Waiting for requester state"}
        </Panel>
        <Panel title="JUDGE">
          {demo.judgePanel.length ? demo.judgePanel.join("\n") : "Waiting for judge output"}
        </Panel>
        <Panel title="BROKER">
          {demo.brokerPanel.length ? demo.brokerPanel.join("\n") : "Waiting for broker execution"}
        </Panel>
        <Panel title="ARC CHAIN / REPUTATION">
          {demo.chainPanel.length ? demo.chainPanel.join("\n") : "Waiting for Arc feedback write"}
        </Panel>
      </section>

      <section className="grid gap-5">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-5 shadow-[0_18px_40px_rgba(0,0,0,0.35)] lg:rounded-[1.75rem] lg:p-6">
          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">A2A Throughput Proof</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">50-transaction settlement run</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Each item makes a sub-cent x402 service payment and writes a matching Arc reputation proof tx.
                The individual proof tx links appear in the log below.
              </p>
              <div className="mt-5 text-sm text-slate-400">
                <p>{fifty.status}</p>
                <p>{fifty.ok}/{fifty.total} ok</p>
                {fifty.runId ? <p className="mt-1 break-all">run id: {fifty.runId}</p> : null}
              </div>
            </div>
            <div className="min-w-0">
              <div className="rounded-full border border-white/10 bg-slate-900 p-1">
                <div
                  className="h-4 rounded-full bg-[linear-gradient(90deg,#2dd4bf,#38bdf8,#f59e0b)] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                <Stat label="Buyer" value={shortHash(fifty.buyer, 8, 6)} href={fifty.buyerUrl || undefined} />
                <Stat label="Progress" value={`${fifty.progress}/${fifty.total}`} />
                <Stat label="Arc Proof Txs" value={`${fifty.proofTxs.length}/${fifty.total}`} />
                <Stat label="Avg Latency" value={fifty.avgLatency} />
                <Stat label="Service Spend" value={fifty.spent} />
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-300 lg:grid-cols-3">
                <p className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Seller URL</span>
                  <span className="mt-2 block break-all">{fifty.sellerUrl || "Not started"}</span>
                </p>
                <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">
                    Buyer Address On Arc
                  </span>
                  <span className="mt-2 block break-all">{fifty.buyerUrl || "Pending"}</span>
                  <span className="mt-2 block text-xs leading-5 text-slate-500">
                    Not exclusive to this run; use the newest transactions plus receipt run ID.
                  </span>
                  {fifty.buyerUrl ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionChip href={fifty.buyerUrl}>Open address</ActionChip>
                      <ActionChip onClick={() => copyText(fifty.buyerUrl, "Buyer address URL")}>Copy URL</ActionChip>
                    </div>
                  ) : null}
                </div>
                <p className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Receipt</span>
                  <span className="mt-2 block break-all">{fifty.receipt || "Pending"}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="DEMO LIVE LOG / LINKS" tall>
            {[
              ...demo.logs,
              demo.proofLinks.length ? "" : "",
              ...demo.proofLinks.map((link, index) => `arc feedback tx ${index + 1}: ${link}`),
            ]
              .filter(Boolean)
              .join("\n") || "Run the A2A demo to populate task proof links"}
          </Panel>
          <Panel title="50-TX PROOF LOG / LINKS" tall>
            {fifty.logs.length ? fifty.logs.join("\n") : "Run the 50-transaction proof to populate throughput logs"}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  href,
  mono = false,
  footer,
  valueClassName = "",
}: {
  label: string;
  value: string;
  accent: "amber" | "orange" | "lime" | "cyan";
  href?: string;
  mono?: boolean;
  footer?: React.ReactNode;
  valueClassName?: string;
}) {
  const accentMap = {
    amber: "from-amber-300/16 to-amber-200/6 text-amber-100",
    orange: "from-orange-300/16 to-orange-200/6 text-orange-100",
    lime: "from-lime-300/16 to-lime-200/6 text-lime-100",
    cyan: "from-cyan-300/16 to-cyan-200/6 text-cyan-100",
  } as const;

  const content = (
    <div
      className={`flex h-full min-h-[8.75rem] flex-col justify-between overflow-hidden rounded-[1.35rem] border border-white/10 bg-gradient-to-br ${accentMap[accent]} p-5`}
    >
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <div className="mt-4">
        <p
          className={`${mono ? "font-mono text-[15px] leading-7" : "text-lg leading-8"} break-words text-white ${valueClassName}`}
        >
          {clip(value, 96)}
        </p>
        {footer}
      </div>
    </div>
  );

  if (!href || footer) return content;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="transition hover:-translate-y-0.5">
      {content}
    </a>
  );
}

function TaskResultCard({
  result,
  onCopy,
}: {
  result: DemoResult;
  onCopy: (text: string, label: string) => void;
}) {
  const txUrl = result.txHash ? `https://testnet.arcscan.app/tx/${result.txHash}` : "";
  return (
    <article className="min-w-0 rounded-[1.25rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(0,0,0,0.28))] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Task {result.index}/{result.total}
          </p>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-white">{result.task}</p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
          {result.judgeScore.toFixed(2)}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
        <p className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Broker</span>
          <span className="mt-1 block truncate text-white">{result.broker}</span>
        </p>
        <p className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Spend</span>
          <span className="mt-1 block text-white">{fmtUsd(result.priceUsd)}</span>
        </p>
        <p className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Latency</span>
          <span className="mt-1 block text-white">{result.latencyMs}ms</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {txUrl ? <ActionChip href={txUrl}>Open Arc tx</ActionChip> : null}
        {result.txHash ? <ActionChip onClick={() => onCopy(result.txHash, "Arc tx")}>Copy hash</ActionChip> : null}
        {txUrl ? <ActionChip onClick={() => onCopy(txUrl, "Arc tx URL")}>Copy URL</ActionChip> : null}
      </div>
    </article>
  );
}

function Panel({
  title,
  children,
  className = "",
  tall = false,
}: {
  title: string;
  children: string;
  className?: string;
  tall?: boolean;
}) {
  return (
    <section
      className={`rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] lg:rounded-[1.75rem] lg:p-5 ${className}`}
    >
      <div className="mb-4 inline-flex rounded-full border border-amber-300/25 bg-amber-300/12 px-3 py-1 text-xs uppercase tracking-[0.22em] text-amber-200">
        {title}
      </div>
      <pre
        className={`overflow-auto whitespace-pre-wrap break-words rounded-[1.2rem] border border-white/8 bg-black/30 p-4 text-[13px] leading-7 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:text-sm sm:leading-8 ${
          tall ? "min-h-[20rem] max-h-[42rem]" : "min-h-[16rem] max-h-[28rem]"
        }`}
      >
        {linkifiedText(children)}
      </pre>
    </section>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 break-all text-sm text-white">{value}</p>
    </div>
  );
  if (!href) return content;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="transition hover:-translate-y-0.5">
      {content}
    </a>
  );
}

function ActionChip({
  children,
  href,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-slate-200 transition hover:border-amber-300/35 hover:text-white"
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-slate-200 transition hover:border-amber-300/35 hover:text-white"
    >
      {children}
    </button>
  );
}
