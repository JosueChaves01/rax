import type { Id, Project } from "@/types/domain";
import type { InvitationStatus, MyInvitation, ProjectInvitation } from "@/types/b2b";
import { assertCan } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { audit, sysRepo, type ServiceDeps } from "./base";
import { markNotificationsReadWhere, notify } from "./notifications";

/**
 * Lado de la persona invitada: ver, aceptar o rechazar invitaciones desde el panel (sin link).
 * Dueño: Dev B (plan técnico §6.2, reemplaza a acceptInvitation(d, token)).
 *
 * La invitación se identifica por el correo (en minúsculas) de la cuenta. La persona invitada todavía
 * no puede leer el proyecto (RLS), así que el nombre del proyecto y del mentor se leen con el
 * repositorio del sistema DESPUÉS de comprobar que la invitación es para su correo.
 *
 * Decisión sobre `projects.owner_id`: al aceptar NO se llena, ni siquiera con la primera persona de
 * un proyecto individual. `is_project_owner` (RLS) y la matriz de permisos dan al dueño todo el flujo
 * viejo (leer documentos sin publicar, notas, la conversación, editar y borrar el proyecto). La
 * persona cliente entra solo como miembro `client` (is_project_client), con lo que ve únicamente lo
 * publicado. `owner_id` queda vacío en los proyectos B2B hasta que la Fase 5 lo retire.
 */

const emailOf = (d: ServiceDeps) => (d.actor.email ?? "").trim().toLowerCase();

/** Invitaciones pendientes para el correo de quien tiene la sesión (sin nombres). */
async function myPendingRows(d: ServiceDeps): Promise<ProjectInvitation[]> {
  const email = emailOf(d);
  if (!email) return [];
  const rows = await d.repo.projectInvitations.list({ email, status: "pending" });
  return rows.filter((i) => i.email === email && i.status === "pending");
}

async function describe(d: ServiceDeps, inv: ProjectInvitation): Promise<MyInvitation | null> {
  const sys = sysRepo(d);
  const project = await sys.projects.get(inv.projectId);
  if (!project) return null; // borrado
  const mentor = await sys.profiles.get(project.mentorId ?? inv.invitedBy);
  return { ...inv, projectName: project.name, mentorName: mentor?.name || "Tu mentor" };
}

/** Invitaciones pendientes para el correo de quien tiene la sesión, la más nueva primero. */
export async function listMyInvitations(d: ServiceDeps): Promise<MyInvitation[]> {
  assertCan(d.actor, "invitation.respond");
  const rows = await myPendingRows(d);
  const out = (await Promise.all(rows.map((r) => describe(d, r)))).filter((r): r is MyInvitation => r !== null);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function joinAsClient(d: ServiceDeps, project: Project): Promise<void> {
  const sys = sysRepo(d);
  const existing = await sys.projectMembers.list({ projectId: project.id, profileId: d.actor.id });
  if (existing.length) return; // ya es parte del proyecto (repetir la aceptación no duplica)
  await sys.projectMembers.insert({ id: `${project.id}:${d.actor.id}`, projectId: project.id, profileId: d.actor.id, role: "client", createdAt: d.now() });
  await audit(d, "member.added", { projectId: project.id, targetId: d.actor.id, meta: { role: "client", via: "invitation" } });
}

/**
 * Acepta (alta como cliente del proyecto) o rechaza una invitación pendiente. Al responder, la
 * notificación de esa invitación queda leída. Repetir la misma respuesta devuelve el mismo resultado.
 */
export async function respondInvitation(d: ServiceDeps, invitationId: Id, accept: boolean): Promise<{ projectId: Id; status: InvitationStatus }> {
  assertCan(d.actor, "invitation.respond");
  const email = emailOf(d);
  const inv = await d.repo.projectInvitations.get(invitationId);
  if (!inv || !email || inv.email !== email) throw notFound("Esta invitación no existe o no es para tu cuenta.");
  const wanted: InvitationStatus = accept ? "accepted" : "declined";
  if (inv.status !== "pending") {
    if (inv.status === wanted && (!inv.respondedBy || inv.respondedBy === d.actor.id)) return { projectId: inv.projectId, status: wanted };
    throw validation(inv.status === "revoked" ? "Tu mentor retiró esta invitación." : "Ya respondiste esta invitación.");
  }
  const project = await sysRepo(d).projects.get(inv.projectId);
  if (!project) throw notFound("El proyecto de esta invitación ya no existe.");

  if (accept) {
    if (d.actor.role === "mentor") throw validation("Tu cuenta es de mentor. Para unirte como cliente, entra con una cuenta personal.");
    if (d.actor.role === "admin") throw validation("Una cuenta de administración no puede unirse como cliente.");
    // Primero el alta (idempotente) y después el estado: si algo falla, la invitación sigue pendiente.
    await joinAsClient(d, project);
  }
  await d.repo.projectInvitations.update(inv.id, { status: wanted, respondedBy: d.actor.id, respondedAt: d.now() });
  await markNotificationsReadWhere(d, "project_invitation", (p) => p.invitationId === inv.id);
  return { projectId: inv.projectId, status: wanted };
}

/**
 * Al iniciar sesión o cargar el panel: crea las notificaciones de invitaciones pendientes que todavía
 * no tienen una (llegaron antes de que la persona tuviera cuenta, o se invitó con la cuenta ya creada y
 * la notificación no se pudo crear). Es idempotente. Devuelve cuántas notificaciones creó.
 */
export async function syncPendingInvitations(d: ServiceDeps): Promise<number> {
  assertCan(d.actor, "invitation.respond");
  const pending = await myPendingRows(d);
  if (!pending.length) return 0;
  const existing = await d.repo.notifications.list({ profileId: d.actor.id, kind: "project_invitation" });
  const covered = (inv: ProjectInvitation) =>
    existing.some((n) => n.payload?.invitationId === inv.id || (!n.payload?.invitationId && n.payload?.projectId === inv.projectId));
  let created = 0;
  for (const inv of pending) {
    if (covered(inv)) continue;
    const info = await describe(d, inv);
    if (!info) continue;
    await notify(d, d.actor.id, "project_invitation", {
      invitationId: inv.id,
      projectId: inv.projectId,
      projectName: info.projectName,
      mentorName: info.mentorName,
    });
    created++;
  }
  return created;
}
