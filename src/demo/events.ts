export const DEMO_EVENT_PREFIX = "@@DEMO_EVENT@@";

export type DemoEvent =
  | {
      type: "run_started";
      totalTasks: number;
      model: string;
      chainId: number;
      explorer: string;
    }
  | {
      type: "task_started";
      index: number;
      total: number;
      task: string;
    }
  | {
      type: "requester_snapshot";
      brokers: Array<{
        id: string;
        service: string;
        price: string;
        reputation: { count: number; avg: number } | null;
      }>;
    }
  | {
      type: "broker_selected";
      brokerId: string;
      brokerName: string;
      service: string;
      input: string;
    }
  | {
      type: "broker_response";
      brokerId: string;
      brokerName: string;
      service: string;
      payer?: string;
      amount?: string;
      network?: string;
      outputPreview?: string;
    }
  | {
      type: "judge_score";
      brokerId: string;
      quality: number;
      reason: string;
    }
  | {
      type: "feedback_written";
      brokerId: string;
      txHash: string;
    }
  | {
      type: "task_completed";
      index: number;
      total: number;
      brokerId: string;
      priceUsd: number;
      judgeScore?: number;
      latencyMs: number;
    }
  | {
      type: "task_failed";
      index: number;
      total: number;
      task: string;
      error: string;
    }
  | {
      type: "run_summary";
      completed: number;
      total: number;
      totalUsdcSpent: number;
      avgLatencyMs: number;
      picks: Record<string, number>;
    };

export function emitDemoEvent(event: DemoEvent): void {
  if (process.env.DEMO_EMIT_EVENTS !== "1") return;
  console.log(`${DEMO_EVENT_PREFIX} ${JSON.stringify(event)}`);
}
