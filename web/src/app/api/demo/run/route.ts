import type { NextRequest } from "next/server";

import { runA2ADemo } from "@/lib/server/a2a-demo";
import { proxyBackendStream } from "@/lib/server/remote-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: NextRequest) {
  const tasks = Number(request.nextUrl.searchParams.get("tasks") ?? "1");
  const proxied = await proxyBackendStream("/demo/run", new URLSearchParams({ tasks: String(tasks) }));
  if (proxied) return proxied;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runA2ADemo(tasks)) {
          controller.enqueue(encoder.encode(encode(event)));
        }
        controller.enqueue(encoder.encode(encode({ type: "done" })));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encode({
              type: "error",
              message: error instanceof Error ? error.message : "Unknown demo error",
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
