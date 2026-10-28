import type { Diagnosis, DiagnosisItem, Message, Project, SessionNote } from "@/types/domain";
import { coveredDimensions, DIMENSIONS, hasEnoughForSummary } from "@/features/conversation/interview";
import { aiMayModify, isCurrent } from "@/features/diagnosis/rules";
import type { InterviewContext } from "./provider";

/** Ventanas de contexto: acotadas a propósito para no enviar el historial completo. */
export const CONTEXT_LIMITS = {
  recentMessages: 12,
  currentItems: 60,
  rejected: 20,
  mentorNotes: 8,
} as const;

/**
 * Selección contextual (sin RAG): mensajes recientes + diagnóstico vigente + correcciones + notas del mentor.
 * Se prioriza lo que las personas confirmaron o corrigieron, porque prevalece sobre interpretaciones.
 * Ver docs/ai-behavior.md §Memoria contextual y docs/decisions/0003-no-rag-yet.md.
 */
export function buildInterviewContext(input: {
  project: Project;
  diagnosis: Diagnosis;
  messages: Message[];
  latestMessage: Message;
  items: DiagnosisItem[];
  mentorNotes: SessionNote[];
}): InterviewContext {
  const sorted = [...input.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const covered = coveredDimensions(sorted);
  const humanFirst = (a: DiagnosisItem, b: DiagnosisItem) => Number(aiMayModify(a)) - Number(aiMayModify(b));

  return {
    projectName: input.project.name,
    projectSummary: input.diagnosis.summary ?? null,
    recentMessages: sorted.filter((m) => m.id !== input.latestMessage.id).slice(-CONTEXT_LIMITS.recentMessages),
    latestMessage: input.latestMessage,
    currentItems: input.items
      .filter(isCurrent)
      .sort(humanFirst)
      .slice(0, CONTEXT_LIMITS.currentItems)
      .map((i) => ({
        id: i.id,
        category: i.category,
        title: i.title,
        content: i.content,
        infoType: i.infoType,
        reviewStatus: i.reviewStatus,
        uncertainty: i.uncertainty,
        protected: !aiMayModify(i),
      })),
    rejectedInterpretations: input.items
      .filter((i) => i.reviewStatus === "rejected")
      .slice(-CONTEXT_LIMITS.rejected)
      .map((i) => ({ id: i.id, title: i.title, content: i.content })),
    coveredDimensions: [...covered],
    pendingDimensions: DIMENSIONS.filter((d) => !covered.has(d)),
    mentorNotes: [...input.mentorNotes]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-CONTEXT_LIMITS.mentorNotes)
      .map((n) => n.body),
    summaryReady: hasEnoughForSummary(covered),
  };
}
