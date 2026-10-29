import { NextResponse } from "next/server";
import { checkN8nHealthLive } from "@/lib/n8n/dispatcher";

export const dynamic = "force-dynamic";

export async function GET() {
  const liveHealth = await checkN8nHealthLive();

  return NextResponse.json({
    status: liveHealth.ok ? "ok" : "degraded",
    service: "rax-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    n8nIntegration: {
      enabled: Boolean(process.env.N8N_WEBHOOK_BASE_URL),
      sharedSecretConfigured: Boolean(process.env.RAX_N8N_SHARED_SECRET || process.env.SUPABASE_SECRET_KEY),
      liveHealth,
    },
  });
}
