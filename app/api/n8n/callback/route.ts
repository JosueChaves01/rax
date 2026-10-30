import { NextRequest, NextResponse } from "next/server";
import { verifyHmacSignature } from "@/lib/n8n/security";
import { N8nCallbackPayloadSchema } from "@/lib/n8n/contracts";
import { createSystemClient } from "@/lib/supabase/server";
import { createPgRepository } from "@/lib/data/supabase-repository";
import { supabaseDb } from "@/lib/data/supabase-db";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const signatureHeader = req.headers.get("x-rax-signature");
  const timestampHeader = req.headers.get("x-rax-timestamp");
  const bodyText = await req.text();

  // 1. Verificación Criptográfica HMAC-SHA256
  const authResult = verifyHmacSignature(bodyText, signatureHeader, timestampHeader);
  if (!authResult.valid) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        reason: authResult.reason,
      },
      { status: 401 }
    );
  }

  // 2. Validación de Contrato con Zod
  let bodyJson: unknown;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
  }

  const parsed = N8nCallbackPayloadSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Schema validation error",
        issues: parsed.error.issues,
      },
      { status: 422 }
    );
  }

  const payload = parsed.data;

  // Do not accept domain proposals until a RAX-created operation can bind this
  // callback to its authorized project, actor, and conversation thread.
  const proposals = payload.data?.proposals ?? [];
  const sanitizedProposals = proposals.map((p) => ({
    ...p,
    needsHumanApproval: true,
  }));

  // Persist an audit record before acknowledging even metadata-only callbacks.
  try {
    const sysClient = createSystemClient();
    const repo = createPgRepository(supabaseDb(sysClient));
    const now = new Date().toISOString();

    // Registro de auditoría
    await repo.auditEvents.insert({
      id: randomUUID(),
      projectId: "global",
      actorId: "system",
      action: payload.status === "completed" ? "ai.invoked" : "ai.failed",
      targetId: payload.operationId,
      meta: {
        workflowId: payload.workflowId,
        correlationId: payload.correlationId,
        proposalsCount: sanitizedProposals.length,
        status: payload.status,
        model: payload.usage?.model || "default",
        totalTokens: payload.usage?.totalTokens || 0,
      },
      createdAt: now,
    });
  } catch {
    console.error("[n8n-callback] No se pudo persistir auditoría en BD.");
    return NextResponse.json(
      { ok: false, persisted: false, error: "callback_audit_persistence_failed" },
      { status: 503 },
    );
  }

  if (sanitizedProposals.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        persisted: false,
        error: "proposal_persistence_not_implemented",
        correlationId: payload.correlationId,
        operationId: payload.operationId,
        workflowId: payload.workflowId,
        proposalsReceived: sanitizedProposals.length,
      },
      { status: 501 },
    );
  }

  // This acknowledges an audit-only result, not a saved or applied proposal.
  return NextResponse.json({
    ok: true,
    persisted: "audit_only",
    correlationId: payload.correlationId,
    operationId: payload.operationId,
    workflowId: payload.workflowId,
    status: payload.status,
    proposalsReceived: 0,
    processedAt: new Date().toISOString(),
  });
}
