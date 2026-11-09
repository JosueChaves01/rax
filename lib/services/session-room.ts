import type {
  AgreementFrequency,
  Id,
  MentorSession,
  MentorshipAgreement,
  MentorshipGoal,
  Project,
  Task,
} from "@/types/domain";
import type { CycleStage, ProjectMode, SessionTopic } from "@/types/b2b";
import { conflict, forbidden, notFound, validation } from "@/lib/errors";
import { audit, sysRepo, type ServiceDeps } from "./base";
import { getIntakeBriefsForMentor, type MentorBriefEntry } from "./mentor-projects";
import {
  confirmMentorshipAgreement,
  createMentorshipGoal,
  ensureMentorshipRelation,
  saveMentorshipAgreement,
} from "./mentorship-relation";
import { createTask } from "./validation";

/**
 * Sala del mentor durante la sesión (pivot B2B, Fase 3): notas en vivo con autosave, el brief del
 * intake, el contexto que completó el mentor y, en la Sesión 1 (kickoff), el acuerdo con sus
 * objetivos y los compromisos por persona. Dueño: Dev A (plan técnico §2.4, §4 Fase 3 y §6.1).
 *
 * Quién ve qué:
 * - El mentor de la sesión (y del proyecto) ve y escribe todo.
 * - Un cliente del proyecto (project_members.role = client) solo ve la llamada y el acuerdo
 *   CONFIRMADO; nunca las notas en vivo, el brief ni el contexto del mentor.
 * - Cualquier otra persona recibe `not_found` (no se revela que la sesión existe).
 *
 * Las lecturas y escrituras de esta sala se hacen como sistema DESPUÉS de verificar la relación:
 * los clientes no leen `mentorship_agreements` por RLS y las notas en vivo no deben depender de
 * la política de actualización de `mentor_sessions`.
 */

/** Tope de las notas en vivo (igual que el check de la columna live_notes). */
export const LIVE_NOTES_MAX = 50_000;

/** Quién mira la sala: el mentor de la sesión o un cliente del proyecto. */
export type RoomViewer = "mentor" | "client";

export interface SessionAccess {
  session: MentorSession;
  project: Project;
  viewer: RoomViewer;
}

async function isProjectMentor(d: ServiceDeps, project: Project): Promise<boolean> {
  if (d.actor.role !== "mentor") return false;
  if (project.mentorId === d.actor.id) return true;
  const assignments = await d.repo.mentorAssignments.list({ projectId: project.id, mentorId: d.actor.id, status: "active" });
  return assignments.length > 0;
}

async function isProjectClient(d: ServiceDeps, projectId: Id): Promise<boolean> {
  if (d.actor.role === "mentor") return false;
  const members = await d.repo.projectMembers.list({ projectId, profileId: d.actor.id });
  return members.some((m) => m.role === "client");
}

/**
 * Relación de quien tiene la sesión con una sesión de un proyecto B2B (con `mentor_id`), sin lanzar.
 * `null` si el proyecto no es B2B o la persona no es su mentor de sesión ni cliente. Lo usan también
 * las llamadas (session-calls.ts) para dejar entrar a los clientes.
 */
export async function b2bSessionViewer(d: ServiceDeps, session: MentorSession, project?: Project | null): Promise<RoomViewer | null> {
  const p = project === undefined ? await d.repo.projects.get(session.projectId) : project;
  if (!p?.mentorId) return null;
  if (session.mentorId === d.actor.id && (await isProjectMentor(d, p))) return "mentor";
  if (await isProjectClient(d, p.id)) return "client";
  return null;
}

/** Carga la sesión y verifica que quien mira es su mentor o un cliente del proyecto. */
export async function sessionAccess(d: ServiceDeps, sessionId: Id): Promise<SessionAccess> {
  const session = await d.repo.mentorSessions.get(sessionId);
  const project = session ? await d.repo.projects.get(session.projectId) : null;
  const viewer = session && project ? await b2bSessionViewer(d, session, project) : null;
  if (!session || !project || !viewer) {
    if (session) await audit(d, "access.denied", { projectId: session.projectId, targetId: sessionId, meta: { action: "session.room" } });
    throw notFound("Esta sesión no existe o no tienes acceso.");
  }
  return { session, project, viewer };
}

/** Solo el mentor de la sesión. Un cliente recibe `forbidden` (ya sabe que la sesión existe). */
async function mentorAccess(d: ServiceDeps, sessionId: Id, opts: { open?: boolean } = {}): Promise<SessionAccess> {
  const access = await sessionAccess(d, sessionId);
  if (access.viewer !== "mentor") throw forbidden("Solo el mentor de la sesión puede hacer esto.");
  if (opts.open && access.session.status === "completed") throw validation("La sesión ya terminó.");
  return access;
}

/* ───────────── Notas en vivo ───────────── */

/**
 * Guarda las notas en vivo (autosave de la sala). Solo el mentor de la sesión.
 *
 * Control de concurrencia optimista por `live_notes_updated_at`: con `expectedUpdatedAt`, si la
 * sesión tiene otra marca (otra pestaña guardó después) lanza `DomainError` con código **`conflict`**
 * y no escribe. `expectedUpdatedAt = ""` significa «nunca se guardaron». Sin `expectedUpdatedAt` se
 * sobrescribe sin comprobar. Las notas no se guardan en una sesión cerrada (`validation`).
 */
export async function saveLiveNotes(
  d: ServiceDeps,
  sessionId: Id,
  text: string,
  expectedUpdatedAt?: string,
): Promise<{ updatedAt: string }> {
  const { session } = await mentorAccess(d, sessionId);
  if (session.status === "completed") throw validation("La sesión ya terminó: las notas en vivo quedaron cerradas.");
  const value = String(text ?? "");
  if (value.length > LIVE_NOTES_MAX) throw validation(`Las notas en vivo admiten hasta ${LIVE_NOTES_MAX.toLocaleString("es")} caracteres.`);
  if (expectedUpdatedAt !== undefined && (session.liveNotesUpdatedAt ?? "") !== expectedUpdatedAt) {
    throw conflict("Las notas cambiaron en otra pestaña o dispositivo mientras escribías.");
  }
  let updatedAt = d.now();
  // La marca debe cambiar en cada guardado para que el control de concurrencia funcione.
  if (session.liveNotesUpdatedAt && updatedAt <= session.liveNotesUpdatedAt) {
    updatedAt = new Date(Date.parse(session.liveNotesUpdatedAt) + 1).toISOString();
  }
  await sysRepo(d).mentorSessions.update(sessionId, { liveNotes: value, liveNotesUpdatedAt: updatedAt });
  return { updatedAt };
}

/* ───────────── Estado de la sala ───────────── */

export interface RoomPerson {
  id: Id;
  name: string;
}

export interface RoomCommitment {
  id: Id;
  title: string;
  assigneeId: Id;
  assigneeName: string;
  dueDate?: string;
  status: Task["status"];
}

export interface SessionRoomState {
  viewer: RoomViewer;
  session: Pick<MentorSession, "id" | "projectId" | "mentorId" | "kind" | "status" | "scheduledAt" | "sessionNumber"> & { agenda: SessionTopic[] };
  project: { id: Id; name: string; mode: ProjectMode; cycleStage: CycleStage };
  mentorName: string;
  /** Clientes que ya aceptaron (para los compromisos por persona). */
  clients: RoomPerson[];
  /** Solo para el mentor. */
  liveNotes?: { text: string; updatedAt?: string };
  /** Solo para el mentor: el consolidado (si hay) primero, después cada persona. */
  briefs?: MentorBriefEntry[];
  /** Solo para el mentor: «contexto faltante» que completó al revisar el intake. */
  clientContext?: string;
  /** Mentor: el acuerdo en curso (borrador) o el vigente. Cliente: solo el confirmado (vigente). */
  agreement?: MentorshipAgreement;
  /** Objetivos activos. El cliente solo los ve cuando hay un acuerdo confirmado. */
  goals: MentorshipGoal[];
  /** Compromisos por persona: tareas abiertas asignadas a cada cliente. */
  commitments: RoomCommitment[];
}

const IN_PROGRESS: MentorshipAgreement["status"][] = ["draft", "confirmed_by_mentor", "confirmed_by_entrepreneur"];

/** El más reciente. `version` también sube con cada edición (control optimista), así que se ordena por creación. */
const latest = (list: MentorshipAgreement[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version)[0];

/** Acuerdo, objetivos y relación abierta del proyecto (leídos como sistema tras verificar acceso). */
async function agreementOf(d: ServiceDeps, projectId: Id) {
  const sys = sysRepo(d);
  const relation = (await sys.mentorshipRelations.list({ projectId })).find((r) => r.stage !== "closed");
  if (!relation) return { relation: undefined, agreements: [] as MentorshipAgreement[], goals: [] as MentorshipGoal[] };
  const [agreements, goals] = await Promise.all([sys.mentorshipAgreements.list({ relationId: relation.id }), sys.mentorshipGoals.list({ relationId: relation.id })]);
  return { relation, agreements, goals: goals.filter((g) => g.status === "active").sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}

async function peopleNames(d: ServiceDeps, ids: Id[]): Promise<Map<Id, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const profiles = await Promise.all(unique.map((id) => sysRepo(d).profiles.get(id)));
  return new Map(profiles.filter((p) => !!p).map((p) => [p!.id, p!.name]));
}

async function clientIds(d: ServiceDeps, projectId: Id): Promise<Id[]> {
  const members = await sysRepo(d).projectMembers.list({ projectId });
  return members.filter((m) => m.role === "client").map((m) => m.profileId);
}

/**
 * Lo que necesita la sala además de la llamada, según quién mira (ver encabezado). El mentor recibe
 * notas en vivo, briefs del intake (`getIntakeBriefsForMentor`), `client_context`, el acuerdo en
 * curso o vigente, los objetivos y la agenda; el cliente, solo la agenda y el acuerdo confirmado.
 */
export async function getSessionRoomState(d: ServiceDeps, sessionId: Id): Promise<SessionRoomState> {
  const { session, project, viewer } = await sessionAccess(d, sessionId);
  const [{ agreements, goals }, clients, tasks] = await Promise.all([
    agreementOf(d, project.id),
    clientIds(d, project.id),
    sysRepo(d).tasks.list({ projectId: project.id }),
  ]);
  const names = await peopleNames(d, [session.mentorId, ...clients]);
  const active = latest(agreements.filter((a) => a.status === "active"));
  const draft = latest(agreements.filter((a) => IN_PROGRESS.includes(a.status)));
  const agreement = viewer === "mentor" ? (draft ?? active) : active;

  const state: SessionRoomState = {
    viewer,
    session: {
      id: session.id,
      projectId: session.projectId,
      mentorId: session.mentorId,
      kind: session.kind,
      status: session.status,
      scheduledAt: session.scheduledAt,
      sessionNumber: session.sessionNumber,
      agenda: session.agenda ?? [],
    },
    project: { id: project.id, name: project.name, mode: project.mode ?? "individual", cycleStage: project.cycleStage ?? "intake" },
    mentorName: names.get(session.mentorId) ?? "Mentor",
    clients: clients.map((id) => ({ id, name: names.get(id) ?? "Cliente" })),
    agreement,
    goals: viewer === "mentor" || active ? goals : [],
    commitments: tasks
      .filter((t) => t.status !== "done" && clients.includes(t.assigneeId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((t) => ({ id: t.id, title: t.title, assigneeId: t.assigneeId, assigneeName: names.get(t.assigneeId) ?? "Cliente", dueDate: t.dueDate, status: t.status })),
  };
  if (viewer === "mentor") {
    const view = await getIntakeBriefsForMentor(d, project.id);
    state.liveNotes = { text: session.liveNotes ?? "", updatedAt: session.liveNotesUpdatedAt };
    state.briefs = view.briefs;
    state.clientContext = view.project.clientContext;
  }
  return state;
}

/* ───────────── Acuerdo de la Sesión 1 (kickoff) ───────────── */

export interface KickoffAgreementInput {
  /** Qué van a trabajar juntos. */
  scope: string;
  /** En grupal: compromisos del grupo. En individual: los de la persona. */
  clientCommitments: string;
  mentorCommitments: string;
  frequency: AgreementFrequency;
  sessionDurationMinutes: number;
  expectedDurationWeeks: number;
  confidentialityTerms?: string;
}

const FREQUENCIES: AgreementFrequency[] = ["weekly", "biweekly", "monthly", "on_demand"];

async function kickoffAccess(d: ServiceDeps, sessionId: Id) {
  const access = await mentorAccess(d, sessionId, { open: true });
  if (access.session.kind !== "kickoff") throw validation("El acuerdo se registra en la Sesión 1 (kickoff).");
  return access;
}

/**
 * Guarda el acuerdo de la Sesión 1 como borrador (lo crea o actualiza el borrador en curso). En
 * grupal es el acuerdo del grupo; los compromisos de cada persona van con `addClientCommitment`.
 * Reutiliza `ensureMentorshipRelation` + `saveMentorshipAgreement` (sin etapa de compatibilidad).
 */
export async function saveKickoffAgreement(d: ServiceDeps, sessionId: Id, input: KickoffAgreementInput): Promise<MentorshipAgreement> {
  const { project } = await kickoffAccess(d, sessionId);
  const scope = String(input?.scope ?? "").trim();
  if (scope.length < 10) throw validation("Describe en una o dos frases qué van a trabajar juntos (10 caracteres o más).");
  if (!FREQUENCIES.includes(input.frequency)) throw validation("Elige la frecuencia de las sesiones.");
  const minutes = Math.round(Number(input.sessionDurationMinutes));
  const weeks = Math.round(Number(input.expectedDurationWeeks));
  const relation = await ensureMentorshipRelation(d, project.id);
  return saveMentorshipAgreement(d, relation.id, {
    frequency: input.frequency,
    sessionDurationMinutes: Number.isFinite(minutes) ? minutes : 0,
    expectedDurationWeeks: Number.isFinite(weeks) ? weeks : 0,
    authorizedChannels: ["Llamadas y sala de RAX"],
    scope,
    mentorCommitments: String(input.mentorCommitments ?? ""),
    entrepreneurCommitments: String(input.clientCommitments ?? ""),
    confidentialityTerms: String(input.confidentialityTerms ?? ""),
  });
}

/**
 * Confirma el acuerdo en curso desde la sala. En un proyecto B2B la confirmación del mentor lo deja
 * vigente de una vez (se acordó en vivo con el cliente; ver `confirmMentorshipAgreement`).
 */
export async function confirmKickoffAgreement(d: ServiceDeps, sessionId: Id): Promise<MentorshipAgreement> {
  const { project } = await kickoffAccess(d, sessionId);
  const { agreements } = await agreementOf(d, project.id);
  const draft = latest(agreements.filter((a) => IN_PROGRESS.includes(a.status)));
  if (!draft) throw validation("Primero guarda el acuerdo; después lo confirman.");
  return confirmMentorshipAgreement(d, draft.id);
}

export interface KickoffGoalInput {
  title: string;
  targetResult: string;
  whyItMatters?: string;
}

/** Objetivo de la mentoría desde la sala (`createMentorshipGoal`). */
export async function addKickoffGoal(d: ServiceDeps, sessionId: Id, input: KickoffGoalInput): Promise<MentorshipGoal> {
  const { project } = await mentorAccess(d, sessionId, { open: true });
  const relation = await ensureMentorshipRelation(d, project.id);
  return createMentorshipGoal(d, relation.id, {
    title: String(input?.title ?? ""),
    targetResult: String(input?.targetResult ?? ""),
    whyItMatters: String(input?.whyItMatters ?? ""),
    description: "",
    baseline: "",
    kind: "qualitative",
    priority: "medium",
  });
}

export interface ClientCommitmentInput {
  /** Cliente del proyecto. En un proyecto individual se puede omitir (es la única persona). */
  clientId?: Id;
  title: string;
  /** AAAA-MM-DD. */
  dueDate?: string;
}

/** Compromiso de una persona: una tarea asignada a ese cliente (`tasks.assignee_id`). */
export async function addClientCommitment(d: ServiceDeps, sessionId: Id, input: ClientCommitmentInput): Promise<Task> {
  const { project } = await mentorAccess(d, sessionId, { open: true });
  const clients = await clientIds(d, project.id);
  if (clients.length === 0) throw validation("Todavía nadie aceptó la invitación a este proyecto.");
  const clientId = input?.clientId || (clients.length === 1 ? clients[0] : undefined);
  if (!clientId) throw validation("Elige a qué persona del grupo le corresponde el compromiso.");
  if (!clients.includes(clientId)) throw notFound("Esa persona no forma parte de este proyecto.");
  const title = String(input?.title ?? "").trim();
  if (title.length < 3) throw validation("Escribe el compromiso (3 caracteres o más).");
  const dueDate = input?.dueDate ? String(input.dueDate).slice(0, 10) : undefined;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw validation("La fecha del compromiso no es válida.");
  return createTask(d, project.id, { title, assigneeId: clientId, dueDate, actionType: "operational_task" });
}
