import type { MentorDecision, MentorSession, MentorSessionKind, SessionNote, SessionNoteKind } from "@/types/domain";
import { buildBriefing } from "@/features/mentoring/briefing";
import { assertHypothesisTransition } from "@/features/hypotheses/rules";
import { forbidden, notFound, validation } from "@/lib/errors";
import { audit, guard, sysRepo, type ServiceDeps } from "./base";
import { touch } from "./projects";

/**
 * El emprendedor solicita una revisión. La primera requiere el resumen confirmado;
 * la segunda, al menos un resultado registrado. Si no hay mentor asignado, se informa sin bloquear
 * el resto de la plataforma.
 */
export async function requestReview(d: ServiceDeps, projectId: string, kind: MentorSessionKind): Promise<MentorSession> {
  const { project } = await guard(d, projectId, "mentor.request_review");
  const [dx] = await d.repo.diagnoses.list({ projectId });
  const sessions = await d.repo.mentorSessions.list({ projectId, kind });
  if (sessions.some((s) => s.status !== "completed")) throw validation("Ya hay una revisión de este tipo en curso.");
  if (kind === "first_review" && !dx.summaryConfirmedAt) throw validation("Primero confirmá el resumen inicial para que el mentor tenga contexto fiable.");
  if (kind === "second_review") {
    const results = await d.repo.experimentResults.list({ projectId });
    if (!results.length) throw validation("La segunda revisión necesita al menos un resultado registrado.");
  }
  const [assignment] = await d.repo.mentorAssignments.list({ projectId, status: "active" });
  if (!assignment)
    throw validation("Todavía no hay un mentor asignado. Podés seguir registrando información; la administración debe asignarte uno.");
  const items = await d.repo.diagnosisItems.list({ projectId });
  const session: MentorSession = {
    id: d.newId("ses"),
    projectId,
    mentorId: assignment.mentorId,
    kind,
    status: "pending",
    briefing: buildBriefing(project, dx, items, d.now()),
    createdAt: d.now(),
  };
  await d.repo.mentorSessions.insert(session);
  await touch(d, projectId);
  return session;
}

async function loadSession(d: ServiceDeps, sessionId: string) {
  const s = await d.repo.mentorSessions.get(sessionId);
  if (!s) throw notFound();
  return s;
}

/** El mentor abre la sesión: se regenera el resumen con el diagnóstico vigente. */
export async function startSession(d: ServiceDeps, sessionId: string) {
  const s = await loadSession(d, sessionId);
  const { project } = await guard(d, s.projectId, "mentor.note");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  const [dx] = await d.repo.diagnoses.list({ projectId: s.projectId });
  const items = await d.repo.diagnosisItems.list({ projectId: s.projectId });
  return d.repo.mentorSessions.update(sessionId, { status: "in_progress", briefing: buildBriefing(project, dx, items, d.now()) });
}

export async function addNote(d: ServiceDeps, sessionId: string, kind: SessionNoteKind, body: string, relatedItemId?: string): Promise<SessionNote> {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.note");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.status === "completed") throw validation("La sesión ya terminó; abrí una nueva para agregar notas.");
  const text = body.trim();
  if (!text) throw validation("La nota está vacía.");
  if (relatedItemId) {
    const item = await d.repo.diagnosisItems.get(relatedItemId);
    if (!item || item.projectId !== s.projectId) throw notFound("El elemento no pertenece a este proyecto.");
  }
  if (s.status === "pending") await d.repo.mentorSessions.update(sessionId, { status: "in_progress" });
  const note: SessionNote = { id: d.newId("note"), sessionId, projectId: s.projectId, authorId: d.actor.id, kind, body: text.slice(0, 2000), relatedItemId, createdAt: d.now() };
  await d.repo.sessionNotes.insert(note);
  await touch(d, s.projectId);
  return note;
}

/** Primera revisión: termina con un acuerdo explícito sobre qué investigar. */
export async function completeFirstReview(d: ServiceDeps, sessionId: string, agreement: string) {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.decide");
  if (s.mentorId !== d.actor.id) throw forbidden();
  if (s.kind !== "first_review") throw validation("Esta no es una primera revisión.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  if (agreement.trim().length < 10) throw validation("Registrá el acuerdo: qué problema investigar y qué falta saber.");
  await addNote(d, sessionId, "agreement", agreement);
  await d.repo.mentorSessions.update(sessionId, { status: "completed", completedAt: d.now() });
  await audit(d, "mentor.session_completed", { projectId: s.projectId, targetId: sessionId, meta: { kind: s.kind } });
}

/**
 * Segunda revisión: decisión explícita con justificación sobre una hipótesis.
 * La decisión se atribuye a quien la tomó; nunca se simula una aprobación.
 */
export async function completeSecondReview(d: ServiceDeps, sessionId: string, decision: MentorDecision, justification: string, hypothesisId: string) {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.decide");
  if (s.mentorId !== d.actor.id) throw forbidden();
  if (s.kind !== "second_review") throw validation("Esta no es una segunda revisión.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  if (justification.trim().length < 10) throw validation("La decisión necesita una justificación.");
  const h = await d.repo.hypotheses.get(hypothesisId);
  if (!h || h.projectId !== s.projectId) throw notFound("La hipótesis no pertenece a este proyecto.");

  const nextStatus = decision === "discard" ? "discarded" : decision === "reformulate" ? "reformulated" : decision === "deepen" ? "testing" : undefined;
  if (nextStatus && nextStatus !== h.status) {
    assertHypothesisTransition(h.status, nextStatus);
    await d.repo.hypotheses.update(h.id, { status: nextStatus, updatedAt: d.now() }, h.version);
    await audit(d, "hypothesis.status_changed", { projectId: s.projectId, targetId: h.id, meta: { from: h.status, to: nextStatus, by: "mentor_decision" } });
  }
  if (decision === "pause") {
    // La decisión del mentor pausa el proyecto: el permiso ya se verificó (mentor.decide).
    await sysRepo(d).projects.update(s.projectId, { status: "paused", updatedAt: d.now() });
    await audit(d, "project.status_changed", { projectId: s.projectId, meta: { to: "paused", by: "mentor_decision" } });
  }
  const experiments = await d.repo.experiments.list({ projectId: s.projectId, hypothesisId });
  for (const e of experiments.filter((x) => x.status === "results_pending")) {
    await d.repo.experiments.update(e.id, { status: "reviewed", updatedAt: d.now() }, e.version);
  }
  await d.repo.mentorSessions.update(sessionId, {
    status: "completed",
    completedAt: d.now(),
    decision: { value: decision, justification: justification.trim().slice(0, 2000), hypothesisId, decidedAt: d.now() },
  });
  await audit(d, "mentor.session_completed", { projectId: s.projectId, targetId: sessionId, meta: { kind: s.kind, decision } });
}
