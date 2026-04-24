import type { NextRequest } from "next/server";

import { proxyBackendStream } from "@/lib/server/remote-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const total = Number(request.nextUrl.searchParams.get("total") ?? "50");
  return proxyBackendStream("/fifty/run", new URLSearchParams({ total: String(total) }));
}
