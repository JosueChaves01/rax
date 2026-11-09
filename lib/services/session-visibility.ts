import type { Id, MentorSession } from "@/types/domain";
import { isB2BFlow } from "@/lib/flags";
import { isOnlyClient, relationOf, sysRepo, type ServiceDeps } from "./base";

/**
 * Qué ve una persona cliente B2B de las sesiones de su proyecto (Fase 5, Dev A).
 *
 * Desde 20261109000104 la persona cliente ya no lee `mentor_sessions` por RLS: la fila trae la
 * preparación del mentor (`briefing`, `pre_session_briefing`) y su síntesis interna. El servidor la
 * lee como sistema DESPUÉS de verificar que es cliente del proyecto y le entrega solo lo que puede
 * ver (fecha, estado, número, agenda). Por la API de Supabase lee la vista `client_sessions`.
 */

/** La sesión sin lo que es solo del mentor (preparación, síntesis interna y notas en vivo). */
export function clientSafeSession(s: MentorSession): MentorSession {
  const { briefing: _briefing, preSessionBriefing: _pre, postSessionSynthesis: _post, liveNotes: _notes, liveNotesUpdatedAt: _at, decision, ...safe } = s;
  return decision ? { ...safe, decision: { ...decision, justification: "" } } : safe;
}

/**
 * Sesiones de un proyecto para quien mira. Con el flujo viejo (o si no es solo cliente) es la
 * lectura de siempre, filtrada por RLS. Una persona cliente B2B recibe la versión segura, leída
 * como sistema porque RLS ya no le muestra la tabla.
 */
export async function listSessionsForViewer(d: ServiceDeps, projectId: Id): Promise<MentorSession[]> {
  if (isB2BFlow() && isOnlyClient(await relationOf(d, projectId))) {
    const project = await d.repo.projects.get(projectId);
    if (project?.mentorId) return (await sysRepo(d).mentorSessions.list({ projectId })).map(clientSafeSession);
  }
  return d.repo.mentorSessions.list({ projectId });
}

/**
 * Una sesión por id para un servicio que verifica el acceso DESPUÉS (sala, llamada). Con el flujo
 * B2B, si RLS no la muestra se lee como sistema: el llamador tiene que comprobar que quien mira es
 * el mentor de la sesión o cliente del proyecto antes de usarla o devolver algo de ella.
 */
export async function loadSessionForAccessCheck(d: ServiceDeps, sessionId: Id): Promise<MentorSession | undefined> {
  const own = await d.repo.mentorSessions.get(sessionId);
  if (own || !isB2BFlow()) return own;
  return sysRepo(d).mentorSessions.get(sessionId);
}
