import type { DiagnosisItem, Message } from "@/types/domain";
import { validation } from "@/lib/errors";
import { buildInterviewContext } from "@/lib/ai/context";
import { vetProposals } from "@/lib/ai/apply";
import { AiUnavailableError } from "@/lib/ai/provider";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { audit, guard, recordHistory, type ServiceDeps } from "./base";
import { touch } from "./projects";

export const MAX_MESSAGE_LENGTH = 4000;

export type SendResult =
  | { ok: true; message: Message; reply: Message; proposalsCreated: number; summaryDrafted: boolean }
  | { ok: false; message: Message; aiError: string };

/**
 * Turno de conversación:
 * 1) guarda el mensaje del emprendedor (siempre, aunque la IA falle);
 * 2) construye un contexto acotado y pide una interpretación estructurada;
 * 3) filtra las propuestas con reglas de dominio y las guarda como "pendientes de confirmar";
 * 4) guarda la respuesta del asistente identificando el proveedor.
 */
export async function sendMessage(d: ServiceDeps, projectId: string, content: string): Promise<SendResult> {
  const { project } = await guard(d, projectId, "conversation.write");
  const text = content.trim();
  if (!text) throw validation("Escribí algo antes de enviar. También vale «no sé».");
  if (text.length > MAX_MESSAGE_LENGTH) throw validation(`El mensaje supera ${MAX_MESSAGE_LENGTH} caracteres. Dividilo en partes.`);

  const [conversation] = await d.repo.conversations.list({ projectId });
  const now = d.now();
  const message = await d.repo.messages.insert({
    id: d.newId("msg"),
    conversationId: conversation.id,
    projectId,
    author: "entrepreneur",
    authorId: d.actor.id,
    content: text,
    createdAt: now,
  });
  await touch(d, projectId);

  const [messages, items, notes, [diagnosis]] = await Promise.all([
    d.repo.messages.list({ projectId }),
    d.repo.diagnosisItems.list({ projectId }),
    d.repo.sessionNotes.list({ projectId }),
    d.repo.diagnoses.list({ projectId }),
  ]);
  const ctx = buildInterviewContext({ project, diagnosis, messages, latestMessage: message, items, mentorNotes: notes });

  let result;
  try {
    result = await d.ai.interpret(ctx);
  } catch (e) {
    const reason = e instanceof AiUnavailableError ? e.reason : "provider_error";
    const userMsg = e instanceof AiUnavailableError ? e.message : "La IA no respondió.";
    await audit(d, "ai.failed", { projectId, actorId: "system", meta: { provider: d.ai.id, reason } });
    // Escenario G: no se inventa una respuesta. El mensaje queda guardado para reintentar.
    return { ok: false, message, aiError: `${userMsg} Tu mensaje quedó guardado; podés seguir y reintentar luego.` };
  }

  await audit(d, "ai.invoked", {
    projectId,
    actorId: "system",
    meta: {
      provider: result.provider,
      promptVersion: PROMPT_VERSION,
      ...(result.usage && { model: result.usage.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }),
      proposals: result.turn.proposals.length,
    },
  });

  const vetted = vetProposals(result.turn.proposals, items, messages);
  let created = 0;
  for (const v of vetted) {
    const p = v.proposal;
    const reason = [p.reason, ...v.adjustments].filter(Boolean).join(" · ");
    if (v.target) {
      const before = v.target;
      const after = await d.repo.diagnosisItems.update(
        before.id,
        { title: p.title, content: p.content, category: p.category, infoType: p.infoType, uncertainty: p.uncertainty, updatedAt: d.now() },
        before.version,
      );
      await recordHistory(d, before, after, "edited", "ai", reason);
    } else {
      const item: DiagnosisItem = {
        id: d.newId("item"),
        projectId,
        category: p.category,
        title: p.title,
        content: p.content,
        infoType: p.infoType,
        reviewStatus: "proposed",
        uncertainty: p.uncertainty,
        source: { kind: p.sourceMessageId ? "conversation" : "ai", refId: p.sourceMessageId ?? undefined, quote: p.quote ?? undefined },
        authorId: "ai",
        relatedItemIds: p.targetItemId ? [p.targetItemId] : [],
        evidenceIds: [],
        version: 1,
        createdAt: d.now(),
        updatedAt: d.now(),
      };
      await d.repo.diagnosisItems.insert(item);
      await recordHistory(d, null, item, "created", "ai", reason);
    }
    created++;
  }
  if (created) await audit(d, "ai.proposal_applied", { projectId, actorId: "ai", meta: { count: created } });

  // Contradicciones visibles como preguntas abiertas pendientes de revisión.
  for (const c of result.turn.contradictions) {
    const item: DiagnosisItem = {
      id: d.newId("item"),
      projectId,
      category: "open_question",
      title: "Posible contradicción",
      content: c.description.slice(0, 1000),
      infoType: "ai_interpretation",
      reviewStatus: "needs_clarification",
      uncertainty: "high",
      source: { kind: "ai" },
      authorId: "ai",
      relatedItemIds: c.itemIds.filter((id) => items.some((i) => i.id === id)),
      evidenceIds: [],
      version: 1,
      createdAt: d.now(),
      updatedAt: d.now(),
    };
    await d.repo.diagnosisItems.insert(item);
    await recordHistory(d, null, item, "created", "ai", "Contradicción detectada");
  }

  // El borrador de resumen nunca se confirma solo: queda pendiente de la persona.
  const summaryDrafted = !!result.turn.summaryDraft && !diagnosis.summary;
  if (summaryDrafted) {
    await d.repo.diagnoses.update(diagnosis.id, { summary: result.turn.summaryDraft!.slice(0, 3000), updatedAt: d.now() });
  }

  const reply = await d.repo.messages.insert({
    id: d.newId("msg"),
    conversationId: conversation.id,
    projectId,
    author: "assistant",
    content: result.turn.reply.slice(0, MAX_MESSAGE_LENGTH),
    provider: result.provider,
    dimension: result.turn.askedDimension ?? undefined,
    createdAt: d.now(),
  });
  return { ok: true, message, reply, proposalsCreated: created, summaryDrafted };
}
