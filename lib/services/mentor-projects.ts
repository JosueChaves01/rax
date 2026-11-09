import { z } from "zod";
import type { Id, Project } from "@/types/domain";
import type { CycleStage, IntakeBriefRecord, IntakeStatus, InvitationStatus, ProjectInvitation, ProjectMode } from "@/types/b2b";
import { assertCan, NO_RELATION, type Action } from "@/lib/authz";
import { isDomainError, notFound, validation } from "@/lib/errors";
import { audit, sysRepo, type ServiceDeps } from "./base";
import { notify } from "./notifications";

/**
 * Proyectos que crea el mentor e invitaciones que envía (por correo, se aceptan desde el panel).
 * Dueño: Dev A (plan técnico §2.4, §6.1 y §6.2).
 *
 * Decisiones de la Fase 2:
 * - `owner_id` queda vacío al crear: es el cliente principal y se llena cuando acepta (Dev B).
 *   No se usa el id del mentor como dueño: `is_project_owner` exige rol emprendedor y el flujo viejo
 *   trataría al mentor como emprendedor. El tipo `Project.ownerId` sigue siendo obligatorio (contrato),
 *   así que acá se omite con un cast y el resto del código ya tolera que no exista (`people[ownerId]`).
 * - Además de `mentor_id` se crea una asignación activa en `mentor_assignments` (assigned_by = el
 *   mentor): así `guard`, `getWorkspace` y las pantallas actuales siguen reconociendo al mentor.
 * - No se crea diagnóstico (congelado, §6.4): `getWorkspace` lo autorrepara si falta.
 */

export interface CreateProjectAsMentorInput {
  name: string;
  description: string;
  mode: ProjectMode;
  clientEmails: string[];
}

export const MENTOR_PROJECT_LIMITS = { name: 80, description: 1000, clientEmails: 20, clientContext: 8000 } as const;

const EMAIL_RE = /^[^\s@]+@[^\s@.][^\s@]*$/;

/** Correo de invitación normalizado (minúsculas, sin espacios). Lanza `validation` si no parece un correo. */
export function normalizeEmail(raw: string): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !EMAIL_RE.test(email)) throw validation(`«${String(raw ?? "").trim() || "(vacío)"}» no parece un correo válido.`);
  return email;
}

const createSchema = z.object({
  name: z.string().transform((s) => s.trim()).pipe(
    z.string().min(2, "Ponle al menos un nombre provisional (2 caracteres o más).").max(MENTOR_PROJECT_LIMITS.name, `El nombre admite hasta ${MENTOR_PROJECT_LIMITS.name} caracteres.`),
  ),
  description: z.string().default("").transform((s) => s.trim()).pipe(
    z.string().max(MENTOR_PROJECT_LIMITS.description, `La descripción admite hasta ${MENTOR_PROJECT_LIMITS.description} caracteres.`),
  ),
  mode: z.enum(["individual", "group"], { message: "Elige si el proyecto es individual o grupal." }),
  clientEmails: z.array(z.string()).default([]),
});

/** Correos sin vacíos ni repetidos, normalizados. */
function cleanEmails(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    if (!String(raw ?? "").trim()) continue;
    const email = normalizeEmail(raw);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/* ───────────── Permisos ───────────── */

async function isMentorOf(d: ServiceDeps, project: Project): Promise<boolean> {
  if (d.actor.role !== "mentor") return false;
  if (project.mentorId === d.actor.id) return true;
  const assignments = await d.repo.mentorAssignments.list({ projectId: project.id, mentorId: d.actor.id, status: "active" });
  return assignments.length > 0;
}

/**
 * Carga el proyecto y verifica que quien tiene la sesión es su mentor (dueño operativo o con
 * asignación activa). Un proyecto ajeno responde igual que uno inexistente.
 */
async function mentorGuard(d: ServiceDeps, projectId: Id, action: Action): Promise<Project> {
  const project = await d.repo.projects.get(projectId);
  if (!project || !(await isMentorOf(d, project))) {
    if (project) await audit(d, "access.denied", { projectId, meta: { action } });
    throw notFound("Este proyecto no existe o no tienes acceso.");
  }
  assertCan(d.actor, action, { ...NO_RELATION, isProjectMentor: true });
  return project;
}

/* ───────────── Proyectos ───────────── */

export async function createProjectAsMentor(
  d: ServiceDeps,
  input: CreateProjectAsMentorInput,
): Promise<{ project: Project; invitations: ProjectInvitation[] }> {
  assertCan(d.actor, "project.create_as_mentor");
  if (!d.actor.onboardedAt) throw validation("Completa la bienvenida antes de crear un proyecto.");
  const parsed = createSchema.safeParse(input ?? {});
  if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? "Revisa los datos del proyecto.");
  const { name, description, mode } = parsed.data;
  const emails = cleanEmails(parsed.data.clientEmails);
  if (mode === "individual" && emails.length > 1) throw validation("Un proyecto individual es para una sola persona. Elige «grupal» para invitar a varias.");
  if (emails.length > MENTOR_PROJECT_LIMITS.clientEmails) throw validation(`Puedes invitar hasta ${MENTOR_PROJECT_LIMITS.clientEmails} personas por proyecto.`);
  if (emails.includes(d.actor.email.trim().toLowerCase())) throw validation("No puedes invitarte a ti mismo como cliente.");
  // Se valida a todas las personas antes de escribir nada, para no dejar un proyecto a medias.
  for (const email of emails) await findInvitee(d, email);

  const now = d.now();
  // owner_id vacío a propósito (ver encabezado): el cliente principal se fija al aceptar.
  const draft = {
    id: d.newId("prj"),
    name,
    description,
    nature: "unknown",
    status: "active",
    shareConversationWithMentor: false,
    createdAt: now,
    updatedAt: now,
    mentorId: d.actor.id,
    mode,
    cycleStage: "intake" satisfies CycleStage,
    clientContext: "",
  } as unknown as Project;

  // mentor_id, mode y cycle_stage solo los escribe el servidor (trigger guard_project_b2b).
  const sys = sysRepo(d);
  const project = await sys.projects.insert(draft);
  await sys.mentorAssignments.insert({
    id: d.newId("asg"),
    projectId: project.id,
    mentorId: d.actor.id,
    status: "active",
    assignedBy: d.actor.id,
    createdAt: now,
  });
  await audit(d, "project.created", { projectId: project.id, targetId: project.id, meta: { b2b: true, mode, invited: emails.length } });

  const invitations: ProjectInvitation[] = [];
  for (const email of emails) invitations.push((await sendInvitation(d, project, email)).invitation);
  return { project, invitations };
}

/* ───────────── Invitaciones ───────────── */

const ACTIVE: InvitationStatus[] = ["pending", "accepted"];

/**
 * Invita a una persona por correo. Si ya tiene cuenta se le notifica al instante (`notify` de
 * notifications.ts); si no, la notificación se crea cuando entra (`syncPendingInvitations`).
 */
export async function inviteClient(
  d: ServiceDeps,
  projectId: Id,
  email: string,
): Promise<{ invitation: ProjectInvitation; notified: boolean }> {
  const project = await mentorGuard(d, projectId, "invitation.send");
  const normalized = normalizeEmail(email);
  if (normalized === d.actor.email.trim().toLowerCase()) throw validation("No puedes invitarte a ti mismo como cliente.");
  const current = await d.repo.projectInvitations.list({ projectId });
  if ((project.mode ?? "individual") === "individual" && current.some((i) => i.email !== normalized && ACTIVE.includes(i.status))) {
    throw validation("Este proyecto es individual y ya tiene a su persona invitada. Revoca esa invitación antes de invitar a otra.");
  }
  return sendInvitation(d, project, normalized, current);
}

async function sendInvitation(
  d: ServiceDeps,
  project: Project,
  email: string,
  current?: ProjectInvitation[],
): Promise<{ invitation: ProjectInvitation; notified: boolean }> {
  const invitee = await findInvitee(d, email);
  const existing = (current ?? (await d.repo.projectInvitations.list({ projectId: project.id }))).find((i) => i.email === email);
  let invitation: ProjectInvitation;
  if (existing && ACTIVE.includes(existing.status)) {
    throw validation(existing.status === "accepted" ? `${email} ya forma parte del proyecto.` : `Ya invitaste a ${email}.`);
  } else if (existing) {
    // Revocada o rechazada antes: se vuelve a abrir (la tabla admite una fila por correo y proyecto).
    invitation = await d.repo.projectInvitations.update(existing.id, { status: "pending", respondedBy: undefined, respondedAt: undefined });
  } else {
    invitation = await d.repo.projectInvitations.insert({
      id: d.newId("inv"),
      projectId: project.id,
      email,
      invitedBy: d.actor.id,
      status: "pending",
      createdAt: d.now(),
    });
  }

  let notified = false;
  if (invitee) {
    try {
      await notify(d, invitee.id, "project_invitation", {
        invitationId: invitation.id,
        projectId: project.id,
        projectName: project.name,
        mentorName: d.actor.name,
      });
      notified = true;
    } catch (e) {
      // La invitación ya quedó guardada; si la campana falla, la persona la ve igual en su inicio.
      if (!(isDomainError(e) && e.code === "not_implemented")) console.warn("[rax] no se pudo notificar la invitación:", invitation.id, e instanceof Error ? e.message : e);
    }
  }
  return { invitation, notified };
}

/** Cuenta con ese correo, si existe. Un mentor no puede entrar como cliente. Se lee como sistema (RLS). */
async function findInvitee(d: ServiceDeps, email: string) {
  const invitee = (await sysRepo(d).profiles.list({ email })).find((p) => p.email.trim().toLowerCase() === email);
  if (invitee?.role === "mentor") throw validation(`${email} es una cuenta de mentor; no puede entrar como cliente.`);
  return invitee;
}

export async function revokeInvitation(d: ServiceDeps, invitationId: Id): Promise<void> {
  const invitation = await d.repo.projectInvitations.get(invitationId);
  if (!invitation) throw notFound("Esta invitación no existe o no tienes acceso.");
  await mentorGuard(d, invitation.projectId, "invitation.send");
  if (invitation.status === "revoked") return;
  if (invitation.status !== "pending") {
    throw validation(invitation.status === "accepted" ? "Esa persona ya aceptó la invitación; no se puede revocar." : "Esa invitación ya fue respondida.");
  }
  await d.repo.projectInvitations.update(invitationId, { status: "revoked" });
}

/* ───────────── Brief del intake ───────────── */

/** «Contexto faltante» que completa el mentor al revisar el brief (projects.client_context). */
export async function setClientContext(d: ServiceDeps, projectId: Id, text: string): Promise<void> {
  await mentorGuard(d, projectId, "intake.review");
  const value = String(text ?? "").trim();
  if (value.length > MENTOR_PROJECT_LIMITS.clientContext) throw validation(`El contexto admite hasta ${MENTOR_PROJECT_LIMITS.clientContext} caracteres.`);
  await d.repo.projects.update(projectId, { clientContext: value, updatedAt: d.now() });
}

/**
 * Único punto donde Dev A escribe el estado del intake: lo marca como revisado. Con `clientId`, solo
 * el intake de esa persona; sin él, todos los enviados del proyecto (en grupal, también el consolidado).
 */
export async function markIntakeReviewed(d: ServiceDeps, projectId: Id, clientId?: Id): Promise<void> {
  await mentorGuard(d, projectId, "intake.review");
  const rows = await d.repo.intakeBriefs.list({ projectId });
  const targets = clientId ? rows.filter((r) => r.clientId === clientId) : rows;
  if (clientId && targets.length === 0) throw notFound("No hay un intake de esa persona en este proyecto.");
  const toReview = targets.filter((r) => r.status === "submitted");
  if (toReview.length === 0) {
    if (targets.some((r) => r.status === "reviewed")) return;
    throw validation("Todavía no hay un intake enviado para revisar.");
  }
  const now = d.now();
  // intake_briefs lo escribe el servidor después de verificar que es el mentor del proyecto.
  for (const row of toReview) await sysRepo(d).intakeBriefs.update(row.id, { status: "reviewed", reviewedAt: now });
}

export interface MentorBriefEntry extends IntakeBriefRecord {
  /** Vacío en el brief consolidado de un proyecto grupal. */
  clientName?: string;
}

export interface MentorBriefView {
  project: { id: Id; name: string; description: string; mode: ProjectMode; cycleStage: CycleStage; clientContext: string };
  /** El consolidado (si hay) primero, después cada persona por nombre. */
  briefs: MentorBriefEntry[];
  invitations: ProjectInvitation[];
}

/** Briefs del intake para el mentor del proyecto (solo él lee `brief`). Se lee directo de la tabla. */
export async function getIntakeBriefsForMentor(d: ServiceDeps, projectId: Id): Promise<MentorBriefView> {
  const project = await mentorGuard(d, projectId, "intake.review");
  const [rows, invitations] = await Promise.all([d.repo.intakeBriefs.list({ projectId }), d.repo.projectInvitations.list({ projectId })]);
  const names = await profileNames(d, rows.map((r) => r.clientId).filter((id): id is Id => !!id));
  const briefs = rows
    .map((r) => ({ ...r, clientName: r.clientId ? (names.get(r.clientId) ?? "Cliente") : undefined }))
    .sort((a, b) => (a.clientId ? 1 : 0) - (b.clientId ? 1 : 0) || (a.clientName ?? "").localeCompare(b.clientName ?? "", "es"));
  return {
    project: projectSummary(project),
    briefs,
    invitations: invitations.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

/* ───────────── Lista de clientes del mentor ───────────── */

export interface MentorProjectSummary {
  project: { id: Id; name: string; description: string; mode: ProjectMode; cycleStage: CycleStage; clientContext: string; createdAt: string; updatedAt: string };
  invitations: ProjectInvitation[];
  /** Estado del intake por persona (sin el brief). `clientId` vacío = consolidado del grupo. */
  intakes: Array<{ clientId?: Id; clientName?: string; status: IntakeStatus; submittedAt?: string; reviewedAt?: string; updatedAt: string }>;
  /** Personas que ya aceptaron (miembros con rol cliente). */
  clients: Array<{ id: Id; name: string }>;
}

/** Proyectos del mentor con invitaciones, clientes y estado del intake. Para «Clientes» y la Bandeja. */
export async function listMentorProjects(d: ServiceDeps): Promise<MentorProjectSummary[]> {
  if (d.actor.role !== "mentor") return [];
  const [own, assigned] = await Promise.all([
    d.repo.projects.list({ mentorId: d.actor.id }),
    d.repo.mentorAssignments.list({ mentorId: d.actor.id, status: "active" }),
  ]);
  const byId = new Map(own.filter((p) => p.mentorId === d.actor.id).map((p) => [p.id, p]));
  for (const a of assigned) {
    if (byId.has(a.projectId)) continue;
    const p = await d.repo.projects.get(a.projectId);
    if (p) byId.set(p.id, p);
  }
  const projects = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const loaded = await Promise.all(
    projects.map(async (p) => {
      const [invitations, rows, members] = await Promise.all([
        d.repo.projectInvitations.list({ projectId: p.id }),
        d.repo.intakeBriefs.list({ projectId: p.id }),
        d.repo.projectMembers.list({ projectId: p.id }),
      ]);
      return { p, invitations, rows, clientIds: members.filter((m) => m.role === "client").map((m) => m.profileId) };
    }),
  );
  const names = await profileNames(d, loaded.flatMap((l) => [...l.clientIds, ...l.rows.map((r) => r.clientId).filter((id): id is Id => !!id)]));
  return loaded.map(({ p, invitations, rows, clientIds }) => ({
    project: { ...projectSummary(p), createdAt: p.createdAt, updatedAt: p.updatedAt },
    invitations: invitations.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    intakes: rows.map((r) => ({
      clientId: r.clientId,
      clientName: r.clientId ? (names.get(r.clientId) ?? "Cliente") : undefined,
      status: r.status,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
      updatedAt: r.updatedAt,
    })),
    clients: clientIds.map((id) => ({ id, name: names.get(id) ?? "Cliente" })),
  }));
}

function projectSummary(p: Project) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    mode: p.mode ?? "individual",
    cycleStage: p.cycleStage ?? "intake",
    clientContext: p.clientContext ?? "",
  };
}

/** Nombres de las personas del proyecto. RLS solo deja leer perfiles propios: se leen como sistema. */
async function profileNames(d: ServiceDeps, ids: Id[]): Promise<Map<Id, string>> {
  const unique = [...new Set(ids)];
  const profiles = await Promise.all(unique.map((id) => sysRepo(d).profiles.get(id)));
  return new Map(profiles.filter((p) => !!p).map((p) => [p!.id, p!.name]));
}
