import type { InfoType, ReviewStatus, Uncertainty } from "@/types/domain";

/** Mapa de colores semánticos (tokens definidos en app/globals.css). */
export const INFO_COLOR: Record<InfoType, string> = {
  entrepreneur_statement: "var(--color-info-statement)",
  documented_observation: "var(--color-info-observation)",
  verifiable_evidence: "var(--color-info-evidence)",
  ai_interpretation: "var(--color-info-ai)",
  hypothesis: "var(--color-info-hypothesis)",
  human_correction: "var(--color-info-correction)",
  unknown: "var(--color-info-unknown)",
  agreed_decision: "var(--color-info-decision)",
};

export const REVIEW_COLOR: Record<ReviewStatus, string> = {
  proposed: "var(--color-highlight)",
  confirmed: "var(--color-ok)",
  corrected: "var(--color-info-correction)",
  rejected: "var(--color-danger)",
  needs_clarification: "var(--color-accent)",
};

export const UNCERTAINTY_LEVEL: Record<Uncertainty, number> = { low: 1, medium: 2, high: 3, unknown: 0 };
