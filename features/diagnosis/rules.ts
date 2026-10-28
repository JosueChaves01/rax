import type {
  Diagnosis,
  DiagnosisItem,
  DiagnosisStatus,
  Id,
  ItemChangeKind,
  MentorSession,
  Uncertainty,
  DiagnosisCategory,
  Hypothesis,
} from "@/types/domain";
import { validation } from "@/lib/errors";

export type ItemChange =
  | { kind: "edit"; title?: string; content?: string; category?: DiagnosisCategory; uncertainty?: Uncertainty; reason?: string }
  | { kind: "confirm" }
  | { kind: "reject"; reason: string }
  | { kind: "request_clarification"; reason: string }
  | { kind: "mark_unknown"; reason?: string }
  | { kind: "attach_evidence"; evidenceId: Id }
  | { kind: "prioritize"; rank: number; rationale: string };

const CHANGE_KIND: Record<ItemChange["kind"], ItemChangeKind> = {
  edit: "edited",
  confirm: "confirmed",
  reject: "rejected",
  request_clarification: "clarification_requested",
  mark_unknown: "marked_unknown",
  attach_evidence: "evidence_attached",
  prioritize: "prioritized",
};

/**
 * Aplica un cambio humano a un elemento del diagnóstico. Función pura:
 * devuelve el parche y el tipo de cambio para que el servicio lo persista con su historial.
 */
export function applyHumanChange(
  item: DiagnosisItem,
  change: ItemChange,
  actorId: Id,
  now: string,
): { patch: Partial<DiagnosisItem>; historyKind: ItemChangeKind; reason?: string } {
  const historyKind = CHANGE_KIND[change.kind];
  switch (change.kind) {
    case "edit": {
      const title = change.title?.trim();
      const content = change.content?.trim();
      if (title !== undefined && title.length === 0) throw validation("El título no puede quedar vacío.");
      if (content !== undefined && content.length === 0) throw validation("El contenido no puede quedar vacío.");
      return {
        historyKind,
        reason: change.reason,
        patch: {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
          ...(change.category && { category: change.category }),
          ...(change.uncertainty && { uncertainty: change.uncertainty }),
          // Una persona que modifica una interpretación la convierte en corrección humana.
          infoType: item.infoType === "ai_interpretation" ? "human_correction" : item.infoType,
          reviewStatus: "corrected",
          authorId: actorId,
          updatedAt: now,
        },
      };
    }
    case "confirm":
      return { historyKind, patch: { reviewStatus: "confirmed", updatedAt: now } };
    case "reject":
      if (!change.reason.trim()) throw validation("Contanos brevemente por qué lo rechazás.");
      return { historyKind, reason: change.reason, patch: { reviewStatus: "rejected", updatedAt: now } };
    case "request_clarification":
      if (!change.reason.trim()) throw validation("Indicá qué necesita aclararse.");
      return { historyKind, reason: change.reason, patch: { reviewStatus: "needs_clarification", updatedAt: now } };
    case "mark_unknown":
      return {
        historyKind,
        reason: change.reason,
        patch: { infoType: "unknown", uncertainty: "unknown", reviewStatus: "confirmed", updatedAt: now },
      };
    case "attach_evidence":
      return {
        historyKind,
        patch: { evidenceIds: [...new Set([...item.evidenceIds, change.evidenceId])], updatedAt: now },
      };
    case "prioritize":
      if (item.category !== "problem") throw validation("Solo los problemas se priorizan.");
      if (!change.rationale.trim()) throw validation("La prioridad necesita una justificación.");
      if (!Number.isInteger(change.rank) || change.rank < 1) throw validation("El orden debe ser un entero positivo.");
      return {
        historyKind,
        reason: change.rationale,
        patch: { priority: { rank: change.rank, rationale: change.rationale, setBy: actorId, setAt: now }, updatedAt: now },
      };
  }
}

/** Un elemento rechazado sigue siendo trazable, pero no forma parte del diagnóstico vigente. */
export const isCurrent = (item: DiagnosisItem) => item.reviewStatus !== "rejected";

/**
 * La IA solo puede modificar en sitio sus propias propuestas aún no revisadas.
 * Todo lo que una persona confirmó, corrigió o rechazó está protegido.
 */
export const aiMayModify = (item: DiagnosisItem) => item.authorId === "ai" && item.reviewStatus === "proposed";

/** Diferencia visual entre propuesta, corrección aceptada y conclusión respaldada por evidencia. */
export function standing(item: DiagnosisItem): "proposal" | "accepted" | "evidence_backed" | "rejected" | "open" {
  if (item.reviewStatus === "rejected") return "rejected";
  if (item.reviewStatus === "proposed" || item.reviewStatus === "needs_clarification") return "proposal";
  if (item.evidenceIds.length > 0 || item.infoType === "verifiable_evidence") return "evidence_backed";
  if (item.infoType === "unknown") return "open";
  return "accepted";
}

/** Estado del diagnóstico derivado de datos reales del dominio (no de condiciones visuales). */
export function deriveDiagnosisStatus(
  diagnosis: Diagnosis,
  items: DiagnosisItem[],
  sessions: MentorSession[],
  hypotheses: Hypothesis[],
): DiagnosisStatus {
  const current = items.filter(isCurrent);
  if (!diagnosis.summary) return "exploring";
  if (!diagnosis.summaryConfirmedAt) return "pending_review";
  const firstReviewDone = sessions.some((s) => s.kind === "first_review" && s.status === "completed");
  if (!firstReviewDone) return "reviewed";
  const prioritized = current.some((i) => i.category === "problem" && i.priority);
  if (!prioritized) return "ready_for_prioritization";
  const approved = hypotheses.some((h) => ["approved", "testing", "supported", "weakened", "inconclusive"].includes(h.status));
  return approved ? "ready_for_experiments" : "ready_for_prioritization";
}

/** Elementos pendientes de revisión humana. */
export const pendingReview = (items: DiagnosisItem[]) =>
  items.filter((i) => i.reviewStatus === "proposed" || i.reviewStatus === "needs_clarification");

export const openQuestions = (items: DiagnosisItem[]) =>
  items.filter((i) => isCurrent(i) && (i.infoType === "unknown" || i.category === "open_question"));
