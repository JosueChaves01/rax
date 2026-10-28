import type { Hypothesis, HypothesisStatus, ResultOutcome } from "@/types/domain";
import { invalidTransition, validation } from "@/lib/errors";

/** Transiciones permitidas. Cualquier otra se rechaza en el servidor. */
export const HYPOTHESIS_TRANSITIONS: Record<HypothesisStatus, HypothesisStatus[]> = {
  draft: ["pending_approval", "discarded"],
  pending_approval: ["approved", "draft", "discarded"],
  approved: ["testing", "discarded"],
  testing: ["supported", "weakened", "inconclusive"],
  supported: ["testing", "reformulated"],
  weakened: ["reformulated", "discarded", "testing"],
  inconclusive: ["testing", "reformulated", "discarded"],
  reformulated: [],
  discarded: [],
};

export function assertHypothesisTransition(from: HypothesisStatus, to: HypothesisStatus) {
  if (!HYPOTHESIS_TRANSITIONS[from].includes(to)) throw invalidTransition(from, to);
}

const VAGUE_PATTERNS = [
  /tendr[aá] [eé]xito/i,
  /les (va a )?gustar[aá]/i,
  /\bfuncionar[aá]\b/i,
  /ser[aá] (rentable|viable|exitos[oa])/i,
  /\bla gente (lo )?(querr[aá]|usar[aá])\b/i,
];

/**
 * Una hipótesis comprobable nombra un segmento, una conducta observable y un criterio.
 * Devuelve los problemas encontrados (vacío = aceptable).
 */
export function hypothesisIssues(h: Pick<Hypothesis, "statement" | "segment" | "evaluationCriterion">): string[] {
  const issues: string[] = [];
  if (h.statement.trim().length < 25) issues.push("La afirmación es demasiado breve para poder contrastarla.");
  if (VAGUE_PATTERNS.some((p) => p.test(h.statement)))
    issues.push("La afirmación es vaga: describí una conducta concreta y observable en lugar de un éxito general.");
  if (!h.segment.trim()) issues.push("Indicá la persona o segmento involucrado.");
  if (!h.evaluationCriterion.trim()) issues.push("Definí cómo vas a evaluarla antes de probarla.");
  return issues;
}

export function assertTestable(h: Pick<Hypothesis, "statement" | "segment" | "evaluationCriterion">) {
  const issues = hypothesisIssues(h);
  if (issues.length) throw validation(issues.join(" "));
}

/** Efecto de un resultado sobre la hipótesis: la evidencia la debilita o respalda, nunca la "prueba". */
export const OUTCOME_TO_HYPOTHESIS: Record<ResultOutcome, HypothesisStatus> = {
  positive: "supported",
  negative: "weakened",
  mixed: "inconclusive",
  inconclusive: "inconclusive",
};
