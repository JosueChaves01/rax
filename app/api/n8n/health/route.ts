import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    // This endpoint reports RAX API liveness. RAX-00 calls it, so it must not
    // call the n8n health webhook itself (that would recurse through RAX-00).
    status: "ok",
    service: "rax-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    n8nIntegration: {
      enabled: Boolean(process.env.N8N_WEBHOOK_BASE_URL),
      sharedSecretConfigured: Boolean(process.env.RAX_N8N_SHARED_SECRET),
    },
  });
}
