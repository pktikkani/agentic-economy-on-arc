export function backendBaseUrl() {
  const value = process.env.A2A_BACKEND_URL?.trim();
  return value ? value.replace(/\/$/, "") : "";
}

export async function proxyBackendStream(path: string, params: URLSearchParams) {
  const base = backendBaseUrl();
  if (!base) {
    throw new Error("Missing A2A_BACKEND_URL. Set it to the Railway backend URL.");
  }

  const response = await fetch(`${base}${path}?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "text/event-stream" },
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(`A2A backend failed: ${response.status} ${body}`);
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
