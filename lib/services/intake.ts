import type { Id, Message, Project } from "@/types/domain";
import type { IntakeBrief, IntakeBriefRecord, IntakeCoverage, IntakeQuestion, IntakeState, IntakeStatus } from "@/types/b2b";
import { assertCan, type Action, type ProjectRelation } from "@/lib/authz";
import { forbidden, notFound, validation } from "@/lib/errors";
import { AiUnavailableError } from "@/lib/ai/provider";
import {
  consolidateGroupBrief,
  DEFAULT_INTAKE_GUIDE,
  generateIntakeBrief,
  intakeModeFor,
  loadMentorContext,
  pendingRequired,
  runInterviewerTurn,
  type IntakeMode,
  type TranscriptLine,
} from "@/lib/ai/intake-interviewer";
import { audit, sysRepo, type ServiceDeps } from "./base";
import { onIntakeSubmitted } from "./cycle";

/**
 * Entrevista de intake guiada por la guía del mentor y brief para la Sesión 1.
 * Dueño: Dev B (plan técnico §2.4 y §6.1). Una entrevista por persona (fila de intake_briefs con su
 * client_id); en proyectos grupales hay además una fila con client_id vacío: el brief consolidado.
 *
 * La transcripción vive en conversations/messages del proyecto, marcada con `intakeClientId` (de
 * quién es la entrevista). El cliente no puede leer intake_briefs (RLS: el brief es del mentor), así
 * que todo se lee y escribe con el repositorio del sistema DESPUÉS de verificar el permiso.
 */

export const MAX_INTAKE_MESSAGE_LENGTH = 4000;
/** Plazo de un turno de la entrevista con IA. */
const TURN_BUDGET_MS = 45_000;
const BRIEF_BUDGET_MS = 90_000;

/* ───────────── Acceso ───────────── */

interface Access {
  project: Project;
  rel: ProjectRelation;
  isMentor: boolean;
}

/** Relación B2B con el proyecto (mentor dueño o asignado, o cliente), resuelta en el servidor. */
async function access(d: ServiceDeps, projectId: Id, action: Action | ((a: Omit<Access, "project">) => Action)): Promise<Access> {
  const project = await d.repo.projects.get(projectId);
  if (!project) throw notFound("Este proyecto no existe o no tienes acceso.");
  const [members, assignments] = await Promise.all([
    d.repo.projectMembers.list({ projectId, profileId: d.actor.id }),
    d.repo.mentorAssignments.list({ projectId, mentorId: d.actor.id, status: "active" }),
  ]);
  const isMentor = d.actor.role === "mentor" && (project.mentorId === d.actor.id || assignments.length > 0);
  const rel: ProjectRelation = {
    isOwner: project.ownerId === d.actor.id,
    isCollaborator: members.some((m) => m.role === "collaborator"),
    isAssignedMentor: assignments.length > 0,
    isProjectMentor: isMentor,
    isClient: members.some((m) => m.role === "client"),
  };
  const act = typeof action === "function" ? action({ rel, isMentor }) : action;
  if (!isMentor && !rel.isClient) {
    await audit(d, "access.denied", { projectId, meta: { action: act } });
    throw notFound("Este proyecto no existe o no tienes acceso.");
  }
  try {
    assertCan(d.actor, act, rel);
  } catch (e) {
    await audit(d, "access.denied", { projectId, meta: { action: act } });
    throw e;
  }
  return { project, rel, isMentor };
}

/** Mentor del proyecto: el dueño operativo o, en proyectos viejos, el de la asignación activa. */
async function mentorIdOf(d: ServiceDeps, project: Project): Promise<Id | undefined> {
  if (project.mentorId) return project.mentorId;
  const [a] = await sysRepo(d).mentorAssignments.list({ projectId: project.id, status: "active" });
  return a?.mentorId;
}

async function nameOf(d: ServiceDeps, id: Id | undefined, fallback: string): Promise<string> {
  if (!id) return fallback;
  return (await sysRepo(d).profiles.get(id))?.name || fallback;
}

/** Guía vigente del mentor (o la mínima si todavía no armó la suya) y su tono. */
async function mentorGuide(d: ServiceDeps, mentorId: Id | undefined): Promise<{ guide: IntakeQuestion[]; tone?: string }> {
  const profile = mentorId ? await sysRepo(d).mentorProfiles.get(mentorId) : undefined;
  const guide = profile?.interviewGuide?.length ? profile.interviewGuide : DEFAULT_INTAKE_GUIDE;
  return { guide, tone: profile?.assistantTone || undefined };
}

/* ───────────── Filas y transcripción ───────────── */

async function records(d: ServiceDeps, projectId: Id): Promise<IntakeBriefRecord[]> {
  return sysRepo(d).intakeBriefs.list({ projectId });
}

/** La fila de una persona, o la consolidada del grupo con `clientId` vacío. */
async function findRecord(d: ServiceDeps, projectId: Id, clientId: Id | undefined): Promise<IntakeBriefRecord | undefined> {
  return (await records(d, projectId)).find((r) => (r.clientId ?? null) === (clientId ?? null));
}

function toState(projectId: Id, clientId: Id | undefined, r: IntakeBriefRecord | undefined, withBrief: boolean): IntakeState {
  return {
    projectId,
    ...(clientId ? { clientId } : {}),
    status: r?.status ?? "not_started",
    coverage: { ...(r?.coverage ?? {}) },
    ...(withBrief && r?.brief ? { brief: r.brief } : {}),
  };
}

/** Empieza (o retoma) la entrevista de la persona: la guía se copia al empezar. */
async function ensureRecord(d: ServiceDeps, projectId: Id, clientId: Id, guide: IntakeQuestion[]): Promise<IntakeBriefRecord> {
  const sys = sysRepo(d);
  const existing = await findRecord(d, projectId, clientId);
  if (!existing) {
    const now = d.now();
    return sys.intakeBriefs.insert({ id: d.newId("intake"), projectId, clientId, status: "in_progress", guideSnapshot: guide, coverage: {}, createdAt: now, updatedAt: now });
  }
  if (existing.status === "not_started") {
    return sys.intakeBriefs.update(existing.id, { status: "in_progress", guideSnapshot: existing.guideSnapshot.length ? existing.guideSnapshot : guide, updatedAt: d.now() });
  }
  return existing;
}

async function ensureConversation(d: ServiceDeps, projectId: Id): Promise<Id> {
  const sys = sysRepo(d);
  const [c] = await sys.conversations.list({ projectId });
  if (c) return c.id;
  return (await sys.conversations.insert({ id: d.newId("conv"), projectId, createdAt: d.now() })).id;
}

async function intakeMessages(d: ServiceDeps, projectId: Id, clientId: Id): Promise<Message[]> {
  const rows = await sysRepo(d).messages.list({ projectId, intakeClientId: clientId });
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const toTranscript = (rows: Message[]): TranscriptLine[] =>
  rows.filter((m) => m.author !== "system").map((m) => ({ role: m.author === "assistant" ? "interviewer" : "client", content: m.content }));

/* ───────────── Lecturas ───────────── */

/**
 * Estado del intake de una persona del proyecto. El cliente solo ve el suyo y nunca el brief; el
 * mentor ve el de quien indique (sin `clientId`: el único cliente en proyectos individuales, el
 * consolidado en los grupales) e incluye el brief.
 */
export async function getIntakeState(d: ServiceDeps, projectId: Id, clientId?: Id): Promise<IntakeState> {
  const { project, isMentor } = await access(d, projectId, ({ isMentor }) => (isMentor ? "intake.review" : "intake.run"));
  if (!isMentor) {
    if (clientId && clientId !== d.actor.id) throw forbidden();
    return toState(projectId, d.actor.id, await findRecord(d, projectId, d.actor.id), false);
  }
  const rows = await records(d, projectId);
  const target = clientId ?? (project.mode === "group" ? undefined : rows.find((r) => r.clientId)?.clientId);
  return toState(projectId, target, rows.find((r) => (r.clientId ?? null) === (target ?? null)), true);
}

export interface IntakeViewMessage {
  id: Id;
  role: "client" | "interviewer";
  content: string;
  /** La respuesta la generó la simulación (sin IA). */
  simulated: boolean;
  createdAt: string;
}

/** Lo que necesita la pantalla del cliente: estado, guía (sin el «para qué»), transcripción y nombres. */
export interface IntakeView {
  state: IntakeState;
  guide: Array<Pick<IntakeQuestion, "id" | "topic" | "question" | "required">>;
  messages: IntakeViewMessage[];
  projectName: string;
  mentorName: string;
  mode: IntakeMode;
}

export async function getIntakeView(d: ServiceDeps, projectId: Id): Promise<IntakeView> {
  const { project } = await access(d, projectId, "intake.run");
  const mentorId = await mentorIdOf(d, project);
  const record = await findRecord(d, projectId, d.actor.id);
  const guide = record?.guideSnapshot.length ? record.guideSnapshot : (await mentorGuide(d, mentorId)).guide;
  const rows = await intakeMessages(d, projectId, d.actor.id);
  return {
    state: toState(projectId, d.actor.id, record, false),
    guide: guide.map(({ id, topic, question, required }) => ({ id, topic, question, required })),
    messages: rows
      .filter((m) => m.author !== "system")
      .map((m) => ({ id: m.id, role: m.author === "assistant" ? "interviewer" : "client", content: m.content, simulated: m.provider === "simulated", createdAt: m.createdAt })),
    projectName: project.name,
    mentorName: await nameOf(d, mentorId, "tu mentor"),
    mode: intakeModeFor(d.ai),
  };
}

/* ───────────── Turno ───────────── */

function assertOpen(status: IntakeStatus) {
  if (status === "submitted" || status === "reviewed") throw validation("Ya enviaste tu entrevista a tu mentor. Si quieres agregar algo, cuéntaselo en la Sesión 1.");
}

/**
 * Un turno de la entrevista. Con `message` vacío y sin conversación previa, el entrevistador abre
 * (saludo + primera pregunta). El mensaje de la persona se guarda aunque la IA falle.
 */
export async function runIntakeTurn(
  d: ServiceDeps,
  projectId: Id,
  message: string,
): Promise<{ reply: string; state: IntakeState; provider: IntakeMode; finished: boolean }> {
  const { project } = await access(d, projectId, "intake.run");
  const text = message.trim();
  if (text.length > MAX_INTAKE_MESSAGE_LENGTH) throw validation(`El mensaje supera ${MAX_INTAKE_MESSAGE_LENGTH} caracteres. Divídelo en partes.`);
  const sys = sysRepo(d);
  const clientId = d.actor.id;
  const mentorId = await mentorIdOf(d, project);
  const current = await findRecord(d, projectId, clientId);
  if (current) assertOpen(current.status);
  const { guide: liveGuide, tone } = await mentorGuide(d, mentorId);
  const record = await ensureRecord(d, projectId, clientId, liveGuide);
  const guide = record.guideSnapshot.length ? record.guideSnapshot : liveGuide;

  const conversationId = await ensureConversation(d, projectId);
  const previous = await intakeMessages(d, projectId, clientId);
  if (!text && previous.length) throw validation("Escribe tu respuesta antes de enviar. También vale «no sé».");
  if (text) {
    await sys.messages.insert({ id: d.newId("msg"), conversationId, projectId, author: "entrepreneur", authorId: clientId, content: text, intakeClientId: clientId, createdAt: d.now() });
  }
  const transcript = toTranscript(previous);
  if (text) transcript.push({ role: "client", content: text });

  const pending = guide.filter((q) => !record.coverage[q.id]).map((q) => q.question);
  const mentorContext = await loadMentorContext(sys, mentorId, [text, ...pending].filter(Boolean).join("\n"));
  const mode = intakeModeFor(d.ai);
  const [clientName, mentorName] = await Promise.all([nameOf(d, clientId, "la persona"), nameOf(d, mentorId, "tu mentor")]);

  let turn;
  try {
    turn = await runInterviewerTurn({
      mode,
      projectName: project.name,
      clientName,
      mentorName,
      assistantTone: tone,
      guide,
      coverage: record.coverage,
      transcript,
      mentorContext,
      deadline: Date.now() + TURN_BUDGET_MS,
    });
  } catch (e) {
    const reason = e instanceof AiUnavailableError ? e.reason : "provider_error";
    await audit(d, "ai.failed", { projectId, actorId: "system", meta: { provider: mode, reason, feature: "intake" } });
    if (e instanceof AiUnavailableError) throw new AiUnavailableError(e.reason, `${e.message} Tu respuesta quedó guardada; prueba de nuevo en un momento.`);
    throw e;
  }

  const coverage: Record<string, IntakeCoverage> = { ...record.coverage };
  for (const u of turn.updates) coverage[u.questionId] = u.status;
  const updated = await sys.intakeBriefs.update(record.id, { coverage, updatedAt: d.now() });
  await sys.messages.insert({
    id: d.newId("msg"),
    conversationId,
    projectId,
    author: "assistant",
    content: turn.reply.slice(0, MAX_INTAKE_MESSAGE_LENGTH),
    provider: turn.provider,
    intakeClientId: clientId,
    createdAt: d.now(),
  });
  if (turn.provider === "openrouter") {
    await audit(d, "ai.invoked", { projectId, actorId: "system", meta: { provider: "openrouter", feature: "intake", ...(turn.model ? { model: turn.model } : {}) } });
  }
  return { reply: turn.reply, state: toState(projectId, clientId, updated, false), provider: turn.provider, finished: turn.finished || pendingRequired(guide, coverage).length === 0 };
}

/** Marca la cobertura de una pregunta (herramienta record_intake_answer del agente). */
export async function recordIntakeAnswer(d: ServiceDeps, projectId: Id, questionId: string, status: IntakeCoverage): Promise<IntakeState> {
  const { project } = await access(d, projectId, "intake.run");
  if (!["answered", "partial", "skipped"].includes(status)) throw validation("Estado de cobertura inválido.");
  const existing = await findRecord(d, projectId, d.actor.id);
  if (existing) assertOpen(existing.status);
  const record = await ensureRecord(d, projectId, d.actor.id, (await mentorGuide(d, await mentorIdOf(d, project))).guide);
  if (!record.guideSnapshot.some((q) => q.id === questionId)) throw validation("Esa pregunta no está en la guía de tu mentor.");
  const updated = await sysRepo(d).intakeBriefs.update(record.id, { coverage: { ...record.coverage, [questionId]: status }, updatedAt: d.now() });
  return toState(projectId, d.actor.id, updated, false);
}

/* ───────────── Envío y brief ───────────── */

/**
 * Genera el brief (validado), deja la entrevista en `submitted` y avisa al motor del ciclo. Si ya
 * estaba enviada, devuelve el brief guardado (doble clic). La acción nunca devuelve el brief al
 * cliente: es solo para el mentor.
 */
export async function submitIntake(d: ServiceDeps, projectId: Id): Promise<IntakeBrief> {
  const { project } = await access(d, projectId, "intake.run");
  const clientId = d.actor.id;
  const record = await findRecord(d, projectId, clientId);
  if (record?.brief && (record.status === "submitted" || record.status === "reviewed")) return record.brief;
  const rows = await intakeMessages(d, projectId, clientId);
  if (!record || record.status === "not_started" || !rows.some((m) => m.author === "entrepreneur")) {
    throw validation("Todavía no empezaste la entrevista. Responde al menos una pregunta antes de enviarla.");
  }
  const mentorId = await mentorIdOf(d, project);
  const guide = record.guideSnapshot.length ? record.guideSnapshot : (await mentorGuide(d, mentorId)).guide;
  const transcript = toTranscript(rows);
  const sys = sysRepo(d);
  const query = [...guide.map((q) => q.question), ...transcript.filter((l) => l.role === "client").map((l) => l.content)].join("\n");
  const mentorContext = await loadMentorContext(sys, mentorId, query);
  const mode = intakeModeFor(d.ai);
  const [clientName, mentorName] = await Promise.all([nameOf(d, clientId, "La persona"), nameOf(d, mentorId, "tu mentor")]);

  let brief: IntakeBrief;
  try {
    brief = await generateIntakeBrief({
      mode,
      projectName: project.name,
      clientName,
      mentorName,
      guide,
      coverage: record.coverage,
      transcript,
      mentorContext,
      now: d.now(),
      deadline: Date.now() + BRIEF_BUDGET_MS,
    });
  } catch (e) {
    const reason = e instanceof AiUnavailableError ? e.reason : "provider_error";
    await audit(d, "ai.failed", { projectId, actorId: "system", meta: { provider: mode, reason, feature: "intake_brief" } });
    throw new AiUnavailableError(
      e instanceof AiUnavailableError ? e.reason : "provider_error",
      "No pudimos preparar el resumen para tu mentor. Tu entrevista quedó guardada; prueba enviarla de nuevo en un momento.",
    );
  }
  await sys.intakeBriefs.update(record.id, { status: "submitted", brief, submittedAt: d.now(), updatedAt: d.now() });
  await audit(d, "ai.invoked", { projectId, actorId: "system", meta: { provider: mode, feature: "intake_brief", model: brief.model } });

  await afterIntakeSubmitted(d, project, brief);
  return brief;
}

/** En un proyecto grupal: todas las personas cliente ya enviaron su entrevista. */
async function allClientsSubmitted(d: ServiceDeps, projectId: Id): Promise<boolean> {
  const [members, rows] = await Promise.all([sysRepo(d).projectMembers.list({ projectId, role: "client" }), records(d, projectId)]);
  if (!members.length) return false;
  return members.every((m) => rows.some((r) => r.clientId === m.profileId && (r.status === "submitted" || r.status === "reviewed")));
}

/**
 * Después del envío: en proyectos grupales, cuando ya enviaron todos, se arma el consolidado; luego
 * el motor del ciclo crea la sesión kickoff pendiente (sin fecha: scheduled_at vacío) con la agenda
 * sugerida y pasa el proyecto a `kickoff` (cycle.ts → onIntakeSubmitted, que vuelve a verificar).
 * Un fallo acá NO hace fallar el envío del intake (el brief ya quedó guardado): se registra y listo.
 */
async function afterIntakeSubmitted(d: ServiceDeps, project: Project, brief: IntakeBrief): Promise<void> {
  let agendaFrom = brief;
  if (project.mode === "group") {
    if (!(await allClientsSubmitted(d, project.id))) return;
    try {
      agendaFrom = await buildGroupBrief(d, project.id);
    } catch (e) {
      console.warn("[intake] no se pudo armar el brief consolidado:", e instanceof Error ? e.message : e);
    }
  }
  try {
    await onIntakeSubmitted(d, project.id, agendaFrom.suggestedAgenda);
  } catch (e) {
    console.warn("[intake] no se pudo abrir la Sesión 1 pendiente:", e instanceof Error ? e.message : e);
  }
}

/** Cobertura del grupo por pregunta: answered si todos, skipped si nadie respondió, partial si mezcla. */
function groupCoverage(guide: IntakeQuestion[], rows: IntakeBriefRecord[]): Record<string, IntakeCoverage> {
  const out: Record<string, IntakeCoverage> = {};
  for (const q of guide) {
    const vals = rows.map((r) => r.coverage[q.id]);
    if (vals.every((v) => v === "answered")) out[q.id] = "answered";
    else if (vals.every((v) => v === "skipped" || v === undefined)) {
      if (vals.some((v) => v === "skipped")) out[q.id] = "skipped";
    } else out[q.id] = "partial";
  }
  return out;
}

/** Proyectos grupales: brief consolidado (fila con client_id vacío) a partir de los individuales. */
export async function buildGroupBrief(d: ServiceDeps, projectId: Id): Promise<IntakeBrief> {
  const { project } = await access(d, projectId, ({ isMentor }) => (isMentor ? "intake.review" : "intake.run"));
  if (project.mode !== "group") throw validation("Solo los proyectos grupales tienen un brief consolidado.");
  const rows = await records(d, projectId);
  const individual = rows.filter((r): r is IntakeBriefRecord & { clientId: Id; brief: IntakeBrief } => Boolean(r.clientId && r.brief) && (r.status === "submitted" || r.status === "reviewed"));
  if (!individual.length) throw validation("Todavía nadie del grupo envió su entrevista.");

  const mentorId = await mentorIdOf(d, project);
  const guide = individual[0].guideSnapshot.length ? individual[0].guideSnapshot : (await mentorGuide(d, mentorId)).guide;
  const sys = sysRepo(d);
  const briefs = await Promise.all(individual.map(async (r) => ({ clientName: await nameOf(d, r.clientId, "Una persona"), brief: r.brief })));
  const mentorContext = await loadMentorContext(sys, mentorId, briefs.map((b) => b.brief.summary).join("\n"));
  const mode = intakeModeFor(d.ai);
  const brief = await consolidateGroupBrief({
    mode,
    projectName: project.name,
    mentorName: await nameOf(d, mentorId, "tu mentor"),
    guide,
    briefs,
    mentorContext,
    now: d.now(),
    deadline: Date.now() + BRIEF_BUDGET_MS,
  });

  const now = d.now();
  const patch = { status: "submitted" as const, guideSnapshot: guide, coverage: groupCoverage(guide, individual), brief, submittedAt: now, updatedAt: now };
  const group = rows.find((r) => !r.clientId);
  if (group) await sys.intakeBriefs.update(group.id, patch);
  else await sys.intakeBriefs.insert({ id: d.newId("intake"), projectId, createdAt: now, ...patch });
  await audit(d, "ai.invoked", { projectId, actorId: "system", meta: { provider: mode, feature: "intake_group_brief", model: brief.model } });
  return brief;
}
