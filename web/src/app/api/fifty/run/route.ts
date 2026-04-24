import type { NextRequest } from "next/server";

import { runA2AFifty } from "@/lib/server/a2a-demo";
import { proxyBackendStream } from "@/lib/server/remote-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: NextRequest) {
  const total = Number(request.nextUrl.searchParams.get("total") ?? "50");
  const proxied = await proxyBackendStream("/fifty/run", new URLSearchParams({ total: String(total) }));
  if (proxied) return proxied;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runA2AFifty(total)) {
          controller.enqueue(encoder.encode(encode(event)));
        }
        controller.enqueue(encoder.encode(encode({ type: "done" })));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encode({
              type: "error",
              message: error instanceof Error ? error.message : "Unknown throughput error",
            })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
