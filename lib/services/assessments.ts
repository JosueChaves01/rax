import type { Id } from "@/types/domain";
import type { Assessment, AssessmentAnswer, AssessmentInput, AssessmentSubmission } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Evaluaciones (exámenes) que el mentor crea y el cliente responde. Reemplazan a hipótesis y
 * experimentos (congelados). Dueño: Dev B (plan técnico §2.4). Contrato de Fase 0.
 */

export async function createAssessment(d: ServiceDeps, projectId: Id, input: AssessmentInput): Promise<Assessment> {
  return pendingContract("createAssessment", d, projectId, input);
}

export async function publishAssessment(d: ServiceDeps, id: Id): Promise<Assessment> {
  return pendingContract("publishAssessment", d, id);
}

export async function submitAssessment(d: ServiceDeps, id: Id, answers: AssessmentAnswer[]): Promise<AssessmentSubmission> {
  return pendingContract("submitAssessment", d, id, answers);
}

export async function reviewSubmission(
  d: ServiceDeps,
  submissionId: Id,
  input: { score?: number; feedback: string },
): Promise<AssessmentSubmission> {
  return pendingContract("reviewSubmission", d, submissionId, input);
}
