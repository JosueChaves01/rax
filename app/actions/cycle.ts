"use server";

/**
 * Server Actions del motor del ciclo (Dev B): agendar sesiones, agenda de temas y etapa del
 * proyecto. Usan `run` / `read` de ./_run y lib/services/cycle.ts.
 * Un archivo "use server" solo exporta funciones async. Todo detrás de RAX_B2B_FLOW.
 */

import { isB2BFlow } from "@/lib/flags";
import type { MentorSession } from "@/types/domain";
import type { Assessment, AssessmentInput, AssessmentSubmission, CycleStage, SessionTopic } from "@/types/b2b";
import { advanceCycleStage, confirmAttendance, scheduleCycleSession, updateSessionAgenda, type ScheduleCycleSessionInput } from "@/lib/services/cycle";
import { closeAssessment, createAssessment, publishAssessment, reviewSubmission, updateAssessment } from "@/lib/services/assessments";
import { run, type ActionResult } from "./_run";

function unavailable(): ActionResult<never> {
  return { ok: false, error: "Esta función todavía no está disponible.", code: "not_available" };
}

/** El mentor agenda la Sesión 1 (o le pone fecha a la pendiente) o una de seguimiento. */
export async function scheduleCycleSessionAction(projectId: string, input: ScheduleCycleSessionInput): Promise<ActionResult<MentorSession>> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => scheduleCycleSession(d, projectId, input));
}

/** El mentor mueve el proyecto a la etapa siguiente del ciclo. */
export async function advanceCycleStageAction(projectId: string, to: CycleStage): Promise<ActionResult> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, async (d) => {
    await advanceCycleStage(d, projectId, to);
    return undefined;
  });
}

/** El mentor edita los temas de una sesión que todavía no terminó. */
export async function updateSessionAgendaAction(projectId: string, sessionId: string, agenda: SessionTopic[]): Promise<ActionResult> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, async (d) => {
    await updateSessionAgenda(d, sessionId, agenda);
    return undefined;
  });
}

/** La persona cliente confirma que asistirá a una sesión agendada. */
export async function confirmAttendanceAction(projectId: string, sessionId: string): Promise<ActionResult<{ sessionId: string; confirmedAt: string }>> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => confirmAttendance(d, sessionId));
}

/* ───────────── Evaluaciones (mentor) ───────────── */

/** El mentor crea una evaluación en borrador. */
export async function createAssessmentAction(projectId: string, input: AssessmentInput): Promise<ActionResult<Assessment>> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => createAssessment(d, projectId, input));
}

/** El mentor edita una evaluación en borrador. */
export async function updateAssessmentAction(projectId: string, assessmentId: string, input: AssessmentInput): Promise<ActionResult<Assessment>> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => updateAssessment(d, assessmentId, input));
}

/** Publica la evaluación (avisa a cada persona cliente). */
export async function publishAssessmentAction(projectId: string, assessmentId: string): Promise<ActionResult<Assessment>> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => publishAssessment(d, assessmentId));
}

/** Cierra la evaluación: ya no recibe entregas. */
export async function closeAssessmentAction(projectId: string, assessmentId: string): Promise<ActionResult<Assessment>> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => closeAssessment(d, assessmentId));
}

/** El mentor revisa una entrega con puntaje y comentario (avisa a la persona). */
export async function reviewSubmissionAction(projectId: string, submissionId: string, input: { score?: number; feedback: string }): Promise<ActionResult<AssessmentSubmission>> {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => reviewSubmission(d, submissionId, input));
}
