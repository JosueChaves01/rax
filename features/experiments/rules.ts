import type { Experiment, ExperimentStatus } from "@/types/domain";
import { invalidTransition, validation } from "@/lib/errors";

export const EXPERIMENT_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  design: ["ready"],
  ready: ["design", "running"],
  running: ["results_pending"],
  results_pending: ["reviewed"],
  reviewed: [],
};

export function assertExperimentTransition(from: ExperimentStatus, to: ExperimentStatus) {
  if (!EXPERIMENT_TRANSITIONS[from].includes(to)) throw invalidTransition(from, to);
}

/** Campos que deben definirse ANTES de observar resultados. */
export const CRITERIA_FIELDS = ["metric", "successCriterion", "rejectionCriterion"] as const;

export function missingForReady(e: Experiment): string[] {
  const missing: string[] = [];
  if (!e.question.trim()) missing.push("pregunta");
  if (!e.method.trim()) missing.push("método");
  if (!e.participants.trim()) missing.push("participantes o fuentes");
  if (!e.metric.trim()) missing.push("métrica o señal");
  if (!e.successCriterion.trim()) missing.push("criterio de éxito");
  if (!e.rejectionCriterion.trim()) missing.push("criterio de rechazo");
  if (!e.evidencePlan.trim()) missing.push("evidencia a recopilar");
  return missing;
}

export function assertReady(e: Experiment) {
  const missing = missingForReady(e);
  if (missing.length) throw validation(`Antes de dejarlo listo falta definir: ${missing.join(", ")}.`);
}

/** Una vez bloqueados, los criterios no se editan: evita reinterpretar cualquier resultado como éxito. */
export function assertCriteriaEditable(e: Experiment, patch: Partial<Experiment>) {
  if (!e.criteriaLockedAt) return;
  const touched = CRITERIA_FIELDS.filter((f) => f in patch && patch[f] !== e[f]);
  if (touched.length) throw validation("Los criterios se bloquearon al iniciar el experimento y no pueden cambiarse.");
}
