import type { Id, MentorSession, Project } from "@/types/domain";
import type { CycleSignals, CycleStage, SessionTopic } from "@/types/b2b";
import { CYCLE_STAGES } from "@/types/b2b";
import { assertCan, type ProjectRelation } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { parseSessionDateTime, SessionDateError } from "@/lib/dates";
import { audit, hasAnyRelation, relationOf, sysRepo, type ServiceDeps } from "./base";
import { notify } from "./notifications";
import { pendingContract } from "./contract";

/**
 * Motor del ciclo: intake → kickoff (Sesión 1) → cycle (Sesión 2..n) → closed.
 * Dueño: Dev B (plan técnico §2.4).
 *
 * - `projects.cycle_stage` lo escribe SOLO este archivo (`writeStage`), con el repositorio del sistema
 *   (el trigger guard_project_b2b rechaza el cambio desde la API) y validando la transición.
 * - Sesión sin fecha: `scheduled_at` queda vacío (null) y `confirmed_at` también. Así queda la kickoff
 *   pendiente que crea el envío del intake; el mentor le pone fecha con `scheduleCycleSession`.
 * - Las sesiones se escriben con el repositorio del sistema DESPUÉS de verificar que quien agenda es
 *   el mentor del proyecto: el mentor dueño (mentor_id) no siempre tiene una asignación, y las
 *   políticas viejas de mentor_sessions solo conocen la asignación.
 */

export interface ScheduleCycleSessionInput {
  kind: "kickoff" | "follow_up";
  /** Fecha y hora (ISO, o local «AAAA-MM-DDTHH:MM» en la hora de la plataforma). Vacía = por agendar. */
  scheduledAt: string;
  agenda: SessionTopic[];
}

/** Transiciones permitidas: solo hacia adelante y de a una etapa. */
const NEXT_STAGE: Record<CycleStage, CycleStage | null> = { intake: "kickoff", kickoff: "cycle", cycle: "closed", closed: null };

export const stageOfProject = (p: Pick<Project, "cycleStage">): CycleStage => p.cycleStage ?? "intake";

export function canAdvance(from: CycleStage, to: CycleStage): boolean {
  return NEXT_STAGE[from] === to;
}

const MAX_AGENDA_TOPICS = 20;
const TOPIC_STATUS = new Set<SessionTopic["status"]>(["planned", "covered", "carried_over"]);

/** Agenda saneada: títulos cortos, sin vacíos, con id y estado válidos. */
export function cleanAgenda(agenda: SessionTopic[] | undefined, newId: (p: string) => string): SessionTopic[] {
  if (!Array.isArray(agenda)) return [];
  return agenda
    .filter((t) => t && typeof t.title === "string" && t.title.trim())
    .slice(0, MAX_AGENDA_TOPICS)
    .map((t) => ({
      id: typeof t.id === "string" && t.id.trim() ? t.id.trim().slice(0, 80) : newId("topic"),
      title: t.title.trim().slice(0, 200),
      goal: typeof t.goal === "string" ? t.goal.trim().slice(0, 500) : "",
      status: TOPIC_STATUS.has(t.status) ? t.status : "planned",
    }));
}

/* ───────────── Acceso ───────────── */

async function loadProject(d: ServiceDeps, projectId: Id): Promise<Project> {
  const project = await d.repo.projects.get(projectId);
  if (!project) throw notFound("Este proyecto no existe o no tienes acceso.");
  return project;
}

/** El mentor del proyecto (dueño operativo o con asignación activa) con permiso para agendar. */
async function asProjectMentor(d: ServiceDeps, projectId: Id): Promise<{ project: Project; rel: ProjectRelation }> {
  const project = await loadProject(d, projectId);
  const rel = await relationOf(d, projectId);
  if (!hasAnyRelation(rel)) {
    await audit(d, "access.denied", { projectId, meta: { action: "cycle.schedule" } });
    throw notFound("Este proyecto no existe o no tienes acceso.");
  }
  try {
    assertCan(d.actor, "cycle.schedule", rel);
  } catch (e) {
    await audit(d, "access.denied", { projectId, meta: { action: "cycle.schedule" } });
    throw e;
  }
  return { project, rel };
}

/** Mentor que conduce las sesiones: el dueño operativo o, en proyectos viejos, el de la asignación activa. */
async function sessionMentorOf(d: ServiceDeps, project: Project): Promise<Id | undefined> {
  if (project.mentorId) return project.mentorId;
  const [a] = await sysRepo(d).mentorAssignments.list({ projectId: project.id, status: "active" });
  return a?.mentorId;
}

/* ───────────── Etapa ───────────── */

/** Único lugar que escribe projects.cycle_stage. Idempotente si ya está en `to`. */
async function writeStage(d: ServiceDeps, project: Project, to: CycleStage, actorId: Id | "system"): Promise<boolean> {
  if (!CYCLE_STAGES.includes(to)) throw validation("Etapa del ciclo no válida.");
  const from = stageOfProject(project);
  if (from === to) return false;
  if (!canAdvance(from, to)) throw validation(`El proyecto no puede pasar de «${STAGE_LABEL[from]}» a «${STAGE_LABEL[to]}».`);
  await sysRepo(d).projects.update(project.id, { cycleStage: to, updatedAt: d.now() });
  project.cycleStage = to;
  await audit(d, "project.status_changed", { projectId: project.id, actorId, meta: { cycleStageFrom: from, cycleStageTo: to } });
  return true;
}

export const STAGE_LABEL: Record<CycleStage, string> = { intake: "Entrevista", kickoff: "Sesión 1", cycle: "Ciclo", closed: "Cierre" };

/** Única función pública que escribe projects.cycle_stage: la usa el mentor del proyecto. */
export async function advanceCycleStage(d: ServiceDeps, projectId: Id, to: CycleStage): Promise<void> {
  const { project } = await asProjectMentor(d, projectId);
  await writeStage(d, project, to, d.actor.id);
}

/* ───────────── Sesiones ───────────── */

async function projectSessions(d: ServiceDeps, projectId: Id): Promise<MentorSession[]> {
  return sysRepo(d).mentorSessions.list({ projectId });
}

const openKickoff = (sessions: MentorSession[]) => sessions.find((s) => s.kind === "kickoff" && s.status !== "completed");

function nextSessionNumber(sessions: MentorSession[]): number {
  const max = sessions.reduce((m, s) => Math.max(m, s.sessionNumber ?? 0), 0);
  return Math.max(max + 1, 2);
}

function parseWhen(d: ServiceDeps, raw: string | undefined): string | undefined {
  let at: string | undefined;
  try {
    at = parseSessionDateTime(raw);
  } catch (e) {
    if (e instanceof SessionDateError) throw validation(e.message);
    throw e;
  }
  if (at && at <= d.now()) throw validation("La fecha de la sesión ya pasó. Elige una fecha y hora futuras.");
  return at;
}

async function notifyClients(d: ServiceDeps, project: Project, session: MentorSession): Promise<void> {
  if (!session.scheduledAt) return;
  const clients = await sysRepo(d).projectMembers.list({ projectId: project.id, role: "client" });
  for (const c of clients) {
    try {
      await notify(d, c.profileId, "session_scheduled", {
        projectId: project.id,
        projectName: project.name,
        sessionId: session.id,
        kind: session.kind,
        scheduledAt: session.scheduledAt,
      });
    } catch (e) {
      console.warn("[cycle] no se pudo avisar la sesión:", e instanceof Error ? e.message : e);
    }
  }
}

/**
 * El mentor agenda la Sesión 1 (kickoff) o una de seguimiento. Si ya hay una kickoff abierta (la
 * pendiente que crea el intake), se le pone fecha y agenda en vez de duplicarla. Con fecha, la sesión
 * queda confirmada (la agenda el propio mentor) y se avisa a las personas cliente.
 */
export async function scheduleCycleSession(d: ServiceDeps, projectId: Id, input: ScheduleCycleSessionInput): Promise<MentorSession> {
  const { project } = await asProjectMentor(d, projectId);
  if (input.kind !== "kickoff" && input.kind !== "follow_up") throw validation("Tipo de sesión no válido.");
  const stage = stageOfProject(project);
  if (stage === "closed") throw validation("El ciclo de este proyecto ya está cerrado.");
  if (input.kind === "follow_up" && stage === "intake") throw validation("Primero agenda la Sesión 1 (kickoff).");
  const scheduledAt = parseWhen(d, input.scheduledAt);
  const agenda = cleanAgenda(input.agenda, d.newId);
  const sys = sysRepo(d);
  const sessions = await projectSessions(d, projectId);
  const now = d.now();
  const confirmedAt = scheduledAt ? now : undefined;

  let session: MentorSession;
  if (input.kind === "kickoff") {
    const open = openKickoff(sessions);
    if (!open && sessions.some((s) => s.kind === "kickoff")) throw validation("La Sesión 1 de este proyecto ya se hizo. Agenda una de seguimiento.");
    if (open) {
      if (open.status === "in_progress") throw validation("La Sesión 1 ya empezó.");
      session = await sys.mentorSessions.update(open.id, {
        scheduledAt,
        confirmedAt,
        agenda: agenda.length ? agenda : (open.agenda ?? []),
        sessionNumber: 1,
        mentorId: open.mentorId || d.actor.id,
      });
    } else {
      session = await sys.mentorSessions.insert({
        id: d.newId("ses"),
        projectId,
        mentorId: d.actor.id,
        kind: "kickoff",
        status: "pending",
        scheduledAt,
        confirmedAt,
        sessionNumber: 1,
        agenda,
        createdAt: now,
      });
    }
    // Agendar la Sesión 1 sin intake (o antes de que termine) también abre la etapa kickoff.
    if (stageOfProject(project) === "intake") await writeStage(d, project, "kickoff", d.actor.id);
  } else {
    session = await sys.mentorSessions.insert({
      id: d.newId("ses"),
      projectId,
      mentorId: d.actor.id,
      kind: "follow_up",
      status: "pending",
      scheduledAt,
      confirmedAt,
      sessionNumber: nextSessionNumber(sessions),
      agenda,
      createdAt: now,
    });
  }
  await audit(d, "session.scheduled", {
    projectId,
    targetId: session.id,
    meta: { kind: session.kind, ...(scheduledAt ? { scheduledAt } : {}), sessionNumber: session.sessionNumber ?? 0 },
  });
  await notifyClients(d, project, session);
  return session;
}

/**
 * Lo llama `submitIntake` (intake.ts) cuando una persona cliente envía su entrevista: crea la sesión
 * kickoff pendiente SIN fecha (si todavía no hay una) con la agenda sugerida y pasa el proyecto a
 * `kickoff`. Es un camino del sistema, no del mentor, así que vuelve a comprobar por su cuenta que
 * quien lo dispara es cliente del proyecto y que el intake está de verdad enviado (en proyectos
 * grupales, el de todas las personas). Es idempotente.
 */
export async function onIntakeSubmitted(d: ServiceDeps, projectId: Id, agenda: SessionTopic[]): Promise<MentorSession | null> {
  const sys = sysRepo(d);
  const project = await sys.projects.get(projectId);
  if (!project) throw notFound();
  const [members, briefs] = await Promise.all([sys.projectMembers.list({ projectId, role: "client" }), sys.intakeBriefs.list({ projectId })]);
  if (!members.some((m) => m.profileId === d.actor.id)) throw notFound("Este proyecto no existe o no tienes acceso.");
  const sent = (clientId: Id) => briefs.some((b) => b.clientId === clientId && (b.status === "submitted" || b.status === "reviewed"));
  const ready = project.mode === "group" ? members.every((m) => sent(m.profileId)) : sent(d.actor.id);
  if (!ready) return null;
  if (stageOfProject(project) === "closed") return null;

  const mentorId = await sessionMentorOf(d, project);
  let kickoff = (await projectSessions(d, projectId)).find((s) => s.kind === "kickoff") ?? null;
  if (!kickoff && mentorId) {
    kickoff = await sys.mentorSessions.insert({
      id: d.newId("ses"),
      projectId,
      mentorId,
      kind: "kickoff",
      status: "pending",
      // Sin fecha: scheduled_at null. La agenda el mentor (scheduleCycleSession).
      sessionNumber: 1,
      agenda: cleanAgenda(agenda, d.newId),
      createdAt: d.now(),
    });
    await audit(d, "session.scheduled", { projectId, targetId: kickoff.id, actorId: "system", meta: { kind: "kickoff", pendingDate: true, sessionNumber: 1 } });
  } else if (!mentorId) {
    console.warn("[cycle] proyecto sin mentor: la Sesión 1 queda sin crear", projectId);
  }
  if (stageOfProject(project) === "intake") await writeStage(d, project, "kickoff", "system");
  return kickoff;
}

/* ───────────── Pendientes de fases siguientes (contrato) ───────────── */

export async function updateSessionAgenda(d: ServiceDeps, sessionId: Id, agenda: SessionTopic[]): Promise<void> {
  return pendingContract("updateSessionAgenda", d, sessionId, agenda);
}

/** Lo llama `closeSession` (Dev A) al final: avanza la etapa y sugiere la próxima sesión. */
export async function onSessionClosed(d: ServiceDeps, session: MentorSession): Promise<void> {
  return pendingContract("onSessionClosed", d, session);
}

/** Comentarios nuevos y resultados de evaluaciones para el briefing de la próxima sesión (briefing-history.ts). */
export async function cycleSignalsForBriefing(d: ServiceDeps, projectId: Id, opts: { since?: string } = {}): Promise<CycleSignals> {
  return pendingContract("cycleSignalsForBriefing", d, projectId, opts);
}
