"use server";

import { isB2BFlow } from "@/lib/flags";
import { getIntakeState, runIntakeTurn, submitIntake } from "@/lib/services/intake";
import { run, type ActionResult } from "./_run";

/**
 * Server Actions del lado del cliente (Dev B): invitaciones, notificaciones, intake, evaluaciones
 * y material publicado. Usan `run` / `read` de ./_run y los servicios de lib/services/
 * (invitations, notifications, intake, assessments, client-portal).
 * Un archivo "use server" solo exporta funciones async. Todo detrás de RAX_B2B_FLOW.
 */

function unavailable(): ActionResult<never> {
  return { ok: false, error: "Esta función todavía no está disponible.", code: "not_available" };
}

/* ───────────── Intake ───────────── */

/** Un turno de la entrevista de intake. Con mensaje vacío (y sin conversación) el asistente abre. */
export async function intakeTurnAction(projectId: string, message: string) {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, (d) => runIntakeTurn(d, projectId, message), { revalidate: false });
}

/** Envía la entrevista al mentor. Devuelve solo el estado: el brief es para el mentor. */
export async function submitIntakeAction(projectId: string) {
  if (!isB2BFlow()) return unavailable();
  return run(projectId, async (d) => {
    await submitIntake(d, projectId);
    return getIntakeState(d, projectId);
  });
}
