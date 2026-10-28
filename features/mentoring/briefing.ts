import type { Diagnosis, DiagnosisItem, MentorBriefing, Project } from "@/types/domain";
import { NATURE_LABEL } from "@/features/labels";
import { isCurrent } from "@/features/diagnosis/rules";

/**
 * Resumen para el mentor construido de forma determinista a partir del diagnóstico vigente.
 * No usa IA: solo reordena lo que las personas declararon, confirmaron o dejaron abierto,
 * de modo que cada línea es trazable a un elemento.
 */
export function buildBriefing(project: Project, diagnosis: Diagnosis, items: DiagnosisItem[], now: string): MentorBriefing {
  const current = items.filter(isCurrent);
  const by = (pred: (i: DiagnosisItem) => boolean) => current.filter(pred).map((i) => `${i.title}: ${i.content}`);
  const problems = current
    .filter((i) => i.category === "problem" && i.infoType !== "unknown")
    .sort((a, b) => (a.priority?.rank ?? 99) - (b.priority?.rank ?? 99));

  return {
    generatedAt: now,
    whatTheyBuild: diagnosis.summary ?? project.description,
    stage: NATURE_LABEL[project.nature],
    mainProblem: problems[0] ? `${problems[0].title}: ${problems[0].content}` : "Sin problema principal registrado todavía.",
    evidence: by((i) => i.evidenceIds.length > 0 || i.infoType === "verifiable_evidence" || i.infoType === "documented_observation"),
    openAssumptions: by((i) => i.infoType === "hypothesis" || (i.uncertainty === "high" && i.infoType !== "unknown")),
    resourcesAndLimits: by((i) => i.category === "operational" || i.category === "financial"),
    questionsForMentor: by((i) => i.infoType === "unknown" || i.category === "open_question" || i.reviewStatus === "needs_clarification"),
  };
}
