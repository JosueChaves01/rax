import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.N8N_WEBHOOK_BASE_URL || "";
  const sharedSecret = process.env.RAX_N8N_SHARED_SECRET || "";
  const mainAgentEnabled = process.env.RAX_N8N_MAIN_AGENT_ENABLED === "true";
  const eventsEnabled = process.env.RAX_N8N_EVENTS_ENABLED === "true";

  let parsedHost = null;
  try {
    if (baseUrl) {
      parsedHost = new URL(baseUrl).host;
    }
  } catch {
    parsedHost = "invalid-url";
  }

  let tunnelConnectivity: { ok: boolean; status?: number; data?: unknown; error?: string } = { ok: false };
  if (baseUrl) {
    const healthUrl = baseUrl.endsWith("/") ? `${baseUrl}webhook/rax-health` : `${baseUrl}/webhook/rax-health`;
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch {}
      tunnelConnectivity = {
        ok: res.ok,
        status: res.status,
        data,
      };
    } catch (err: unknown) {
      tunnelConnectivity = {
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: {
      hasBaseUrl: Boolean(baseUrl),
      webhookHost: parsedHost,
      hasSharedSecret: Boolean(sharedSecret),
      secretLength: sharedSecret.length,
      mainAgentEnabled,
      eventsEnabled,
    },
    tunnelConnectivity,
  });
}
