import type { Diagnosis, Experiment, Hypothesis, MentorSession, Message, ProjectPhase } from "@/types/domain";

export interface PhaseInput {
  messages: Message[];
  diagnosis: Diagnosis;
  sessions: MentorSession[];
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  hasPrioritizedProblem: boolean;
}

/**
 * La fase del proyecto se deriva de datos del dominio; no existe un campo "fase" editable a mano
 * que pueda contradecir lo que realmente ocurrió.
 */
export function derivePhase(x: PhaseInput): ProjectPhase {
  const entrepreneurMessages = x.messages.filter((m) => m.author === "entrepreneur").length;
  if (entrepreneurMessages === 0 && !x.diagnosis.summary) return "new";
  if (!x.diagnosis.summary) return "conversation";
  if (!x.diagnosis.summaryConfirmedAt) return "summary_pending";

  const first = x.sessions.find((s) => s.kind === "first_review");
  if (!first || first.status !== "completed") return "mentor_review_1";

  const second = x.sessions.find((s) => s.kind === "second_review");
  if (second?.status === "completed") return "decided";

  if (!x.hasPrioritizedProblem) return "prioritizing";

  const live = x.hypotheses.filter((h) => h.status !== "discarded" && h.status !== "reformulated");
  if (!live.some((h) => h.status !== "draft" && h.status !== "pending_approval")) return "hypotheses";

  if (x.experiments.some((e) => e.status === "results_pending")) return "results_review";
  if (x.experiments.some((e) => e.status === "running")) return "experiments_running";
  if (x.experiments.length && x.experiments.every((e) => e.status === "reviewed")) return "results_review";
  return "experiments_preparing";
}
