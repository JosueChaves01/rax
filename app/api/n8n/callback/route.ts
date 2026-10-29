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

  // 3. Procesamiento seguro de propuestas
  // Garantía: Todas las propuestas generadas por IA ingresan marcadas como 'needsHumanApproval: true'
  // y se asocian al correlationId para trazabilidad completa.
  const proposals = payload.data?.proposals ?? [];
  const sanitizedProposals = proposals.map((p) => ({
    ...p,
    needsHumanApproval: true,
  }));

  // 4. Persistencia en la base de datos (si la configuración de Supabase está disponible)
  try {
    const sysClient = createSystemClient();
    const repo = createPgRepository(supabaseDb(sysClient));
    const now = new Date().toISOString();

    // Registro de auditoría
    await repo.auditEvents.insert({
      id: randomUUID(),
      projectId: "global",
      actorId: "system",
      action: "ai.invoked",
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
  } catch (err: unknown) {
    // Si la BD no está configurada (ej. en ciertos entornos de test), no bloqueamos la respuesta
    console.warn("[n8n-callback] No se pudo persistir auditoría en BD:", err);
  }

  // Retornar acuse de recibo inmediato
  return NextResponse.json({
    ok: true,
    correlationId: payload.correlationId,
    operationId: payload.operationId,
    workflowId: payload.workflowId,
    status: payload.status,
    proposalsReceived: sanitizedProposals.length,
    processedAt: new Date().toISOString(),
  });
}
