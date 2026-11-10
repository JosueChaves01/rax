import type { Id, MentorSession, MentorshipAgreement, MentorshipGoal, Project, Task } from "@/types/domain";
import type { CycleSignals, CycleStage, IntakeStatus, ProjectMode, SessionTopic } from "@/types/b2b";
import { CYCLE_STAGES } from "@/types/b2b";
import { assertCan, can, type ProjectRelation } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { parseSessionDateTime, SessionDateError } from "@/lib/dates";
import { audit, hasAnyRelation, relationOf, sysRepo, type ServiceDeps } from "./base";
import { notify } from "./notifications";
import { nextSessionOf } from "./client-portal";

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
  /**
   * Sesión pendiente a la que se le pone fecha (p. ej. la Sesión 2 sugerida al cerrar la anterior).
   * Sin id, un seguimiento reutiliza la primera sesión de seguimiento pendiente SIN fecha, si hay.
   */
  sessionId?: Id;
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
    const target = input.sessionId
      ? sessions.find((s) => s.id === input.sessionId)
      : sessions
          .filter((s) => s.kind === "follow_up" && s.status === "pending" && !s.scheduledAt)
          .sort((a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0))[0];
    if (input.sessionId && (!target || target.kind !== "follow_up")) throw notFound("Esa sesión no existe en este proyecto.");
    if (target && target.status !== "pending") throw validation("Esa sesión ya empezó o terminó.");
    session = target
      ? await sys.mentorSessions.update(target.id, {
          scheduledAt,
          confirmedAt,
          agenda: agenda.length ? agenda : (target.agenda ?? []),
          sessionNumber: target.sessionNumber ?? nextSessionNumber(sessions),
          mentorId: target.mentorId || d.actor.id,
        })
      : await sys.mentorSessions.insert({
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


/* ───────────── Agenda de temas ───────────── */

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Valida la forma de una agenda que llega de afuera (acción o herramienta) antes de sanearla. */
export function validateAgenda(agenda: unknown): SessionTopic[] {
  if (!Array.isArray(agenda)) throw validation("La agenda debe ser una lista de temas.");
  if (agenda.length > MAX_AGENDA_TOPICS) throw validation(`La agenda admite hasta ${MAX_AGENDA_TOPICS} temas.`);
  for (const t of agenda) {
    if (!isPlainObject(t) || typeof t.title !== "string") throw validation("Cada tema necesita un título.");
    if (t.goal !== undefined && typeof t.goal !== "string") throw validation("El objetivo de un tema debe ser texto.");
    if (t.status !== undefined && !TOPIC_STATUS.has(t.status as SessionTopic["status"])) throw validation("Estado de tema no válido.");
  }
  return agenda as SessionTopic[];
}

/**
 * El mentor edita los temas de una sesión que todavía no terminó (agregar, quitar, marcar como
 * cubiertos durante la sesión). Al cerrarla, lo que quede «planned» pasa a la sesión siguiente.
 */
export async function updateSessionAgenda(d: ServiceDeps, sessionId: Id, agenda: SessionTopic[]): Promise<void> {
  const session = await sysRepo(d).mentorSessions.get(sessionId);
  if (!session) throw notFound("Esta sesión no existe o no tienes acceso.");
  await asProjectMentor(d, session.projectId);
  if (session.status === "completed") throw validation("La sesión ya terminó: su agenda quedó cerrada.");
  const clean = cleanAgenda(validateAgenda(agenda), d.newId);
  const seen = new Set<string>();
  const unique = clean.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  await sysRepo(d).mentorSessions.update(sessionId, { agenda: unique });
}

/* ───────────── Cierre de una sesión (hook del sistema) ───────────── */

const clipText = (s: string | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const titleKey = (t: SessionTopic) => t.title.trim().toLowerCase();

/** Agrega temas sin repetir id ni título. Devuelve la agenda nueva y si cambió. */
function mergeTopics(base: SessionTopic[], extra: SessionTopic[]): { agenda: SessionTopic[]; changed: boolean } {
  const ids = new Set(base.map((t) => t.id));
  const titles = new Set(base.map(titleKey));
  const out = [...base];
  for (const t of extra) {
    if (out.length >= MAX_AGENDA_TOPICS) break;
    if (ids.has(t.id) || titles.has(titleKey(t))) continue;
    ids.add(t.id);
    titles.add(titleKey(t));
    out.push(t);
  }
  return { agenda: out, changed: out.length !== base.length };
}

/** Acuerdo vigente del proyecto (el de mayor versión que no fue reemplazado) y sus objetivos. */
async function currentAgreement(d: ServiceDeps, projectId: Id): Promise<{ agreement?: MentorshipAgreement; goals: MentorshipGoal[] }> {
  const sys = sysRepo(d);
  const relations = await sys.mentorshipRelations.list({ projectId });
  const relation = relations.find((r) => r.stage !== "closed") ?? relations[0];
  if (!relation) return { goals: [] };
  const [agreements, goals] = await Promise.all([sys.mentorshipAgreements.list({ relationId: relation.id }), sys.mentorshipGoals.list({ relationId: relation.id })]);
  const agreement = agreements.filter((a) => a.status !== "superseded").sort((a, b) => b.version - a.version)[0];
  return { agreement, goals: goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}

const CONFIRMED_AGREEMENT = new Set<MentorshipAgreement["status"]>(["active", "confirmed_by_mentor", "confirmed_by_entrepreneur"]);

/**
 * Temas sugeridos para la sesión siguiente: de la Sesión 1 salen los objetivos activos y los
 * compromisos del acuerdo confirmado; de cualquier sesión, los compromisos y próximos pasos de la
 * síntesis. Los ids son deterministas (derivados de la sesión cerrada) para que el hook sea idempotente.
 */
function suggestedTopics(closed: MentorSession, ctx: { agreement?: MentorshipAgreement; goals: MentorshipGoal[] }): SessionTopic[] {
  const out: SessionTopic[] = [];
  const n = closed.sessionNumber ?? (closed.kind === "kickoff" ? 1 : undefined);
  const label = n ? `la Sesión ${n}` : "la sesión anterior";
  if (closed.kind === "kickoff") {
    for (const g of ctx.goals.filter((x) => x.status === "active").slice(0, 6)) {
      out.push({
        id: `${closed.id}:goal:${g.id}`,
        title: clipText(`Avance: ${g.title}`, 200),
        goal: clipText(g.targetResult || g.whyItMatters || g.description, 500),
        status: "planned",
      });
    }
    const a = ctx.agreement;
    if (a && CONFIRMED_AGREEMENT.has(a.status) && a.entrepreneurCommitments.trim()) {
      out.push({ id: `${closed.id}:agreement`, title: "Compromisos del acuerdo", goal: clipText(a.entrepreneurCommitments, 500), status: "planned" });
    }
  }
  const syn = closed.postSessionSynthesis;
  if (syn?.entrepreneurCommitments?.length) {
    out.push({
      id: `${closed.id}:commitments`,
      title: `Compromisos de ${label}`,
      goal: clipText(syn.entrepreneurCommitments.map((c) => c.title).join("; "), 500),
      status: "planned",
    });
  }
  if (syn?.nextSteps?.trim()) {
    out.push({ id: `${closed.id}:next`, title: `Próximos pasos de ${label}`, goal: clipText(syn.nextSteps, 500), status: "planned" });
  }
  return out;
}

/**
 * Hook del sistema que `closeSession` (Dev A) llama al final, con la sesión ya cerrada:
 * - Sesión 1 (kickoff) cerrada → el proyecto pasa a `cycle` y queda sugerida la Sesión 2 (pendiente,
 *   sin fecha) con temas del acuerdo confirmado, los objetivos y los próximos pasos de la síntesis.
 * - Seguimiento cerrado → los temas que siguen «planned» se marcan «carried_over» en esa sesión y se
 *   pasan (como «planned») a la próxima sesión pendiente; si no hay una, se crea.
 * - Avisa a las personas cliente (`session_closed`) una sola vez por sesión.
 * Es idempotente: llamarlo dos veces no duplica sesiones, temas ni avisos. Solo actúa en proyectos
 * B2B (con mentor_id) y en sesiones kickoff / follow_up; en el resto no hace nada.
 * Devuelve la próxima sesión sugerida (o null si no aplica).
 */
export async function onSessionClosed(d: ServiceDeps, session: MentorSession): Promise<MentorSession | null> {
  const sys = sysRepo(d);
  const closed = (await sys.mentorSessions.get(session.id)) ?? session;
  if (closed.status !== "completed") return null;
  if (closed.kind !== "kickoff" && closed.kind !== "follow_up") return null;
  const project = await sys.projects.get(closed.projectId);
  if (!project?.mentorId) return null; // proyecto del flujo viejo
  const rel = await relationOf(d, project.id);
  if (!can(d.actor, "cycle.schedule", rel)) throw notFound("Este proyecto no existe o no tienes acceso.");

  // Etapa: cerrar la Sesión 1 (o una de seguimiento con la etapa atrasada) abre el ciclo.
  if (stageOfProject(project) === "intake") await writeStage(d, project, "kickoff", "system");
  if (stageOfProject(project) === "kickoff") await writeStage(d, project, "cycle", "system");

  // Temas de la sesión cerrada: lo que no se cubrió queda «carried_over».
  const closedAgenda = closed.agenda ?? [];
  const marked = closedAgenda.map((t) => (t.status === "planned" ? { ...t, status: "carried_over" as const } : t));
  if (marked.some((t, i) => t.status !== closedAgenda[i].status)) await sys.mentorSessions.update(closed.id, { agenda: marked });

  let next: MentorSession | null = null;
  if (stageOfProject(project) !== "closed") {
    const carried = marked.filter((t) => t.status === "carried_over").map((t) => ({ ...t, status: "planned" as const }));
    const ctx = closed.kind === "kickoff" ? await currentAgreement(d, project.id) : { goals: [] };
    const extra = [...carried, ...suggestedTopics(closed, ctx)];
    const sessions = await projectSessions(d, project.id);
    const target = sessions
      .filter((s) => s.id !== closed.id && s.kind === "follow_up" && s.status === "pending")
      .sort((a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0) || a.createdAt.localeCompare(b.createdAt))[0];
    if (target) {
      const { agenda, changed } = mergeTopics(target.agenda ?? [], extra);
      next = changed ? await sys.mentorSessions.update(target.id, { agenda }) : target;
    } else {
      next = await sys.mentorSessions.insert({
        id: d.newId("ses"),
        projectId: project.id,
        mentorId: closed.mentorId,
        kind: "follow_up",
        status: "pending",
        // Sin fecha: la pone el mentor con scheduleCycleSession.
        sessionNumber: nextSessionNumber(sessions),
        agenda: mergeTopics([], extra).agenda,
        createdAt: d.now(),
      });
      await audit(d, "session.scheduled", {
        projectId: project.id,
        targetId: next.id,
        actorId: "system",
        meta: { kind: "follow_up", pendingDate: true, suggested: true, sessionNumber: next.sessionNumber ?? 0 },
      });
    }
  }

  const clients = await sys.projectMembers.list({ projectId: project.id, role: "client" });
  for (const c of clients) {
    try {
      const sent = await sys.notifications.list({ profileId: c.profileId, kind: "session_closed" });
      if (sent.some((n) => n.payload?.sessionId === closed.id)) continue;
      await notify(d, c.profileId, "session_closed", {
        projectId: project.id,
        projectName: project.name,
        sessionId: closed.id,
        kind: closed.kind,
        ...(closed.sessionNumber ? { sessionNumber: closed.sessionNumber } : {}),
        ...(next ? { nextSessionId: next.id } : {}),
      });
    } catch (e) {
      console.warn("[cycle] no se pudo avisar el cierre de la sesión:", e instanceof Error ? e.message : e);
    }
  }
  return next;
}

/* ───────────── Asistencia del cliente ───────────── */

async function asProjectClient(d: ServiceDeps, projectId: Id): Promise<Project> {
  const project = await loadProject(d, projectId);
  const rel = await relationOf(d, projectId);
  if (!rel.isClient || !can(d.actor, "resource.read", rel)) throw notFound("Este proyecto no existe o no tienes acceso.");
  return project;
}

/** Quiénes (personas cliente) confirmaron asistencia a cada sesión, leído del registro de auditoría. */
async function attendanceBySession(d: ServiceDeps, projectId: Id): Promise<Map<Id, Set<Id>>> {
  const events = await sysRepo(d).auditEvents.list({ projectId, action: "session.confirmed" });
  const out = new Map<Id, Set<Id>>();
  for (const e of events) {
    if (!e.targetId || e.meta?.attendance !== true) continue;
    if (!out.has(e.targetId)) out.set(e.targetId, new Set());
    out.get(e.targetId)!.add(e.actorId);
  }
  return out;
}

/**
 * La persona cliente confirma que asistirá a una sesión agendada. La fecha la fija el mentor
 * (`scheduleCycleSession`; `confirmSession` de mentoring.ts es solo del mentor): esto deja constancia
 * en el registro (session.confirmed con meta.attendance) y le avisa al mentor. Idempotente.
 */
export async function confirmAttendance(d: ServiceDeps, sessionId: Id): Promise<{ sessionId: Id; confirmedAt: string }> {
  const sys = sysRepo(d);
  const session = await sys.mentorSessions.get(sessionId);
  if (!session) throw notFound("Esta sesión no existe o no tienes acceso.");
  const project = await asProjectClient(d, session.projectId);
  if (session.status === "completed") throw validation("La sesión ya terminó.");
  if (!session.scheduledAt) throw validation("Tu mentor todavía no le puso fecha a esta sesión.");
  // audit_events no se filtra por actor en la base (actor_kind + actor_id): se filtra aquí.
  const previous = (await sys.auditEvents.list({ projectId: project.id, action: "session.confirmed", targetId: sessionId })).find(
    (e) => e.actorId === d.actor.id && e.meta?.attendance === true,
  );
  if (previous) return { sessionId, confirmedAt: previous.createdAt };
  const confirmedAt = d.now();
  await sys.auditEvents.insert({
    id: d.newId("aud"),
    action: "session.confirmed",
    actorId: d.actor.id,
    projectId: project.id,
    targetId: sessionId,
    meta: { attendance: true, scheduledAt: session.scheduledAt },
    createdAt: confirmedAt,
  });
  try {
    await notify(d, session.mentorId, "session_confirmed", {
      projectId: project.id,
      projectName: project.name,
      sessionId,
      clientName: d.actor.name,
      scheduledAt: session.scheduledAt,
    });
  } catch (e) {
    console.warn("[cycle] no se pudo avisar la confirmación:", e instanceof Error ? e.message : e);
  }
  return { sessionId, confirmedAt };
}

/* ───────────── Vista del ciclo (inicio y sesiones del proyecto) ───────────── */

export interface CycleSessionView {
  id: Id;
  number?: number;
  kind: MentorSession["kind"];
  status: MentorSession["status"];
  mentorId: Id;
  scheduledAt?: string;
  confirmedAt?: string;
  startedAt?: string;
  completedAt?: string;
  agenda: SessionTopic[];
  synthesis?: { summary: string; agreedDecisions: string[]; commitments: string[]; nextSteps?: string; generatedAt: string };
  /** Personas cliente que confirmaron asistencia. */
  attendance: Id[];
}

export interface CycleAgreementView {
  id: Id;
  version: number;
  status: MentorshipAgreement["status"];
  frequency: MentorshipAgreement["frequency"];
  sessionDurationMinutes: number;
  scope: string;
  mentorCommitments: string;
  entrepreneurCommitments: string;
  expectedDurationWeeks: number;
  confirmedAt?: string;
}

export interface CycleOverview {
  projectId: Id;
  projectName: string;
  stage: CycleStage;
  mode: ProjectMode;
  viewer: "mentor" | "client";
  viewerId: Id;
  sessions: CycleSessionView[];
  nextSession?: CycleSessionView;
  latestSynthesis?: { sessionId: Id; number?: number; kind: MentorSession["kind"]; summary: string; nextSteps?: string; completedAt?: string };
  /** Acuerdo vigente. El cliente no ve borradores. */
  agreement?: CycleAgreementView;
  goals: Array<{ id: Id; title: string; targetResult: string; status: MentorshipGoal["status"] }>;
  /** Entrevista de cada persona cliente (el cliente solo ve la suya). Nunca incluye el brief. */
  intake: Array<{ clientId: Id; name: string; status: IntakeStatus }>;
  /** Compromisos (tareas): el cliente ve los suyos; el mentor, los abiertos de todas las personas cliente. */
  commitments: Array<{ id: Id; title: string; status: Task["status"]; dueDate?: string; assigneeId: Id; assigneeName: string }>;
  clients: Array<{ id: Id; name: string }>;
}

const byNumber = (a: MentorSession, b: MentorSession) =>
  (a.sessionNumber ?? Number.MAX_SAFE_INTEGER) - (b.sessionNumber ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt);

function sessionView(s: MentorSession, attendance: Set<Id> | undefined): CycleSessionView {
  const syn = s.postSessionSynthesis;
  return {
    id: s.id,
    ...(s.sessionNumber ? { number: s.sessionNumber } : {}),
    kind: s.kind,
    status: s.status,
    mentorId: s.mentorId,
    ...(s.scheduledAt ? { scheduledAt: s.scheduledAt } : {}),
    ...(s.confirmedAt ? { confirmedAt: s.confirmedAt } : {}),
    ...(s.startedAt ? { startedAt: s.startedAt } : {}),
    ...(s.completedAt ? { completedAt: s.completedAt } : {}),
    agenda: s.agenda ?? [],
    ...(syn && s.status === "completed"
      ? {
          synthesis: {
            summary: syn.summary,
            agreedDecisions: syn.agreedDecisions ?? [],
            commitments: (syn.entrepreneurCommitments ?? []).map((c) => c.title),
            ...(syn.nextSteps ? { nextSteps: syn.nextSteps } : {}),
            generatedAt: syn.generatedAt,
          },
        }
      : {}),
    attendance: [...(attendance ?? [])],
  };
}

/**
 * Lo que muestran el inicio y /sesiones de un proyecto B2B, para el mentor o para una persona
 * cliente. Se lee con el repositorio del sistema DESPUÉS de comprobar la relación, y deja fuera lo que
 * el cliente no debe ver: briefings, notas en vivo, el brief del intake y acuerdos en borrador.
 */
export async function getCycleOverview(d: ServiceDeps, projectId: Id): Promise<CycleOverview> {
  const project = await loadProject(d, projectId);
  const rel = await relationOf(d, projectId);
  const viewer =
    rel.isProjectMentor && can(d.actor, "cycle.schedule", rel) ? "mentor" : rel.isClient && can(d.actor, "resource.read", rel) ? "client" : null;
  if (!viewer) throw notFound("Este proyecto no existe o no tienes acceso.");
  const sys = sysRepo(d);
  const [sessions, members, briefs, tasks, attendance, { agreement, goals }] = await Promise.all([
    projectSessions(d, projectId),
    sys.projectMembers.list({ projectId, role: "client" }),
    sys.intakeBriefs.list({ projectId }),
    sys.tasks.list({ projectId }),
    attendanceBySession(d, projectId),
    currentAgreement(d, projectId),
  ]);
  const people = new Map<Id, string>();
  await Promise.all(
    [...new Set([...members.map((m) => m.profileId), ...tasks.map((t) => t.assigneeId)])].map(async (id) => {
      const p = await sys.profiles.get(id).catch(() => undefined);
      if (p) people.set(id, p.name);
    }),
  );
  const views = [...sessions].sort(byNumber).map((s) => sessionView(s, attendance.get(s.id)));
  const next = nextSessionOf(sessions);
  const lastDone = sessions
    .filter((s) => s.status === "completed" && s.postSessionSynthesis)
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))[0];
  const visibleAgreement = agreement && (viewer === "mentor" || agreement.status !== "draft") ? agreement : undefined;
  const clientIds = new Set(members.map((m) => m.profileId));
  const visibleTasks = tasks
    .filter((t) => (viewer === "client" ? t.assigneeId === d.actor.id : t.status !== "done" && clientIds.has(t.assigneeId)))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.localeCompare(b.createdAt));
  const syn = lastDone?.postSessionSynthesis;

  return {
    projectId,
    projectName: project.name,
    stage: stageOfProject(project),
    mode: project.mode ?? "individual",
    viewer,
    viewerId: d.actor.id,
    sessions: views,
    ...(next ? { nextSession: views.find((v) => v.id === next.id) } : {}),
    ...(lastDone && syn
      ? {
          latestSynthesis: {
            sessionId: lastDone.id,
            ...(lastDone.sessionNumber ? { number: lastDone.sessionNumber } : {}),
            kind: lastDone.kind,
            summary: syn.summary,
            ...(syn.nextSteps ? { nextSteps: syn.nextSteps } : {}),
            ...(lastDone.completedAt ? { completedAt: lastDone.completedAt } : {}),
          },
        }
      : {}),
    ...(visibleAgreement
      ? {
          agreement: {
            id: visibleAgreement.id,
            version: visibleAgreement.version,
            status: visibleAgreement.status,
            frequency: visibleAgreement.frequency,
            sessionDurationMinutes: visibleAgreement.sessionDurationMinutes,
            scope: visibleAgreement.scope,
            mentorCommitments: visibleAgreement.mentorCommitments,
            entrepreneurCommitments: visibleAgreement.entrepreneurCommitments,
            expectedDurationWeeks: visibleAgreement.expectedDurationWeeks,
            ...(visibleAgreement.confirmedAt ? { confirmedAt: visibleAgreement.confirmedAt } : {}),
          },
        }
      : {}),
    goals: (viewer === "mentor" || visibleAgreement ? goals : [])
      .filter((g) => g.status !== "discarded")
      .map((g) => ({ id: g.id, title: g.title, targetResult: g.targetResult, status: g.status })),
    intake: members
      .filter((m) => viewer === "mentor" || m.profileId === d.actor.id)
      .map((m) => ({
        clientId: m.profileId,
        name: people.get(m.profileId) ?? "Persona cliente",
        status: briefs.find((b) => b.clientId === m.profileId)?.status ?? "not_started",
      })),
    commitments: visibleTasks.slice(0, 30).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      ...(t.dueDate ? { dueDate: t.dueDate } : {}),
      assigneeId: t.assigneeId,
      assigneeName: people.get(t.assigneeId) ?? "Sin asignar",
    })),
    clients: members.map((m) => ({ id: m.profileId, name: people.get(m.profileId) ?? "Persona cliente" })),
  };
}

/* ───────────── Señales para el briefing (lo consume briefing-history.ts de Dev A) ───────────── */

const MAX_SIGNAL_COMMENTS = 50;

/**
 * Comentarios nuevos de las personas cliente sobre documentos y sesiones, y resultados de
 * evaluaciones, desde la última sesión cerrada (o desde `since`). Solo para el mentor del proyecto.
 */
export async function cycleSignalsForBriefing(d: ServiceDeps, projectId: Id, opts: { since?: string } = {}): Promise<CycleSignals> {
  await asProjectMentor(d, projectId);
  const sys = sysRepo(d);
  const [sessions, members, comments, assessments] = await Promise.all([
    projectSessions(d, projectId),
    sys.projectMembers.list({ projectId, role: "client" }),
    sys.comments.list({ projectId }),
    sys.assessments.list({ projectId }),
  ]);
  const since =
    opts.since ??
    sessions
      .filter((s) => s.status === "completed" && s.completedAt)
      .map((s) => s.completedAt!)
      .sort()
      .at(-1);
  const after = (at?: string) => !!at && (!since || at > since);
  const clients = new Set(members.map((m) => m.profileId));

  const newComments: CycleSignals["newComments"] = [];
  for (const c of comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if ((c.targetType !== "document" && c.targetType !== "session") || !clients.has(c.authorId) || !after(c.createdAt)) continue;
    newComments.push({ targetType: c.targetType, targetId: c.targetId, authorId: c.authorId, body: clipText(c.body, 1000), createdAt: c.createdAt });
  }

  const assessmentResults: CycleSignals["assessmentResults"] = [];
  for (const a of assessments) {
    for (const s of await sys.assessmentSubmissions.list({ assessmentId: a.id })) {
      if (s.status === "draft" || !after(s.reviewedAt ?? s.submittedAt)) continue;
      assessmentResults.push({ assessmentId: a.id, title: a.title, clientId: s.clientId, status: s.status, ...(typeof s.score === "number" ? { score: s.score } : {}) });
    }
  }
  return { newComments: newComments.slice(-MAX_SIGNAL_COMMENTS), assessmentResults };
}
