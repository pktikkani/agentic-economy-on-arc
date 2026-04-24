import type { NextRequest } from "next/server";

import { proxyBackendStream } from "@/lib/server/remote-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tasks = Number(request.nextUrl.searchParams.get("tasks") ?? "1");
  return proxyBackendStream("/demo/run", new URLSearchParams({ tasks: String(tasks) }));
}
