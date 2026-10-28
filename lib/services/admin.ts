import type { MentorAssignment, MentorOnboarding, Profile } from "@/types/domain";
import { assertCan } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { audit, type ServiceDeps } from "./base";

const ADMIN_AUDIT = ["mentor.assigned", "mentor.revoked", "mentor.applied", "mentor.approved", "mentor.rejected", "access.denied", "project.created", "member.added"];

/**
 * Administración mínima de Fase Cero: personas, asignaciones de mentoría y auditoría.
 * El administrador ve metadatos de proyectos (nombre, dueño, mentores), no su contenido.
 */
export async function adminOverview(d: ServiceDeps) {
  assertCan(d.actor, "admin.manage");
  const [profiles, projects, assignments, events] = await Promise.all([
    d.repo.profiles.list(),
    d.repo.projects.list(),
    d.repo.mentorAssignments.list(),
    d.repo.auditEvents.list(),
  ]);
  const active = assignments.filter((a) => a.status === "active");
  return {
    profiles: profiles.sort((a, b) => a.name.localeCompare(b.name)),
    pendingMentors: profiles.filter((p) => p.mentorStatus === "pending"),
    /** Carga de cada mentor frente a la capacidad que declaró en su onboarding. */
    mentorLoad: Object.fromEntries(
      profiles
        .filter((p) => p.role === "mentor")
        .map((p) => [p.id, { active: active.filter((a) => a.mentorId === p.id).length, max: (p.onboarding as MentorOnboarding | undefined)?.maxProjects ?? null }]),
    ),
    projects: projects.map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId, status: p.status, createdAt: p.createdAt })),
    assignments: assignments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // Solo eventos de permisos, asignaciones y accesos denegados: sin contenido de proyectos.
    audit: events
      .filter((e) => ADMIN_AUDIT.includes(e.action))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100),
  };
}

export async function assignMentor(d: ServiceDeps, projectId: string, mentorId: string): Promise<MentorAssignment> {
  assertCan(d.actor, "admin.manage");
  const [project, mentor] = await Promise.all([d.repo.projects.get(projectId), d.repo.profiles.get(mentorId)]);
  if (!project) throw notFound("El proyecto no existe.");
  if (!mentor || mentor.role !== "mentor") throw validation("La persona elegida no tiene rol de mentor.");
  const active = await d.repo.mentorAssignments.list({ projectId, mentorId, status: "active" });
  if (active.length) throw validation("Ese mentor ya está asignado a este proyecto.");
  const a: MentorAssignment = { id: d.newId("asg"), projectId, mentorId, status: "active", assignedBy: d.actor.id, createdAt: d.now() };
  await d.repo.mentorAssignments.insert(a);
  await audit(d, "mentor.assigned", { projectId, targetId: a.id, meta: { mentorId } });
  return a;
}

export async function revokeMentor(d: ServiceDeps, assignmentId: string) {
  assertCan(d.actor, "admin.manage");
  const a = await d.repo.mentorAssignments.get(assignmentId);
  if (!a) throw notFound();
  if (a.status === "revoked") return a;
  const next = await d.repo.mentorAssignments.update(assignmentId, { status: "revoked", revokedAt: d.now() });
  await audit(d, "mentor.revoked", { projectId: a.projectId, targetId: a.id, meta: { mentorId: a.mentorId } });
  return next;
}

/** Aprobar a quien pidió ser mentor: recién ahí tiene el rol y puede recibir proyectos. */
export async function reviewMentorApplication(d: ServiceDeps, profileId: string, approve: boolean): Promise<Profile> {
  assertCan(d.actor, "admin.manage");
  const p = await d.repo.profiles.get(profileId);
  if (!p) throw notFound();
  if (p.mentorStatus !== "pending") throw validation("Esta persona no tiene una solicitud de mentoría pendiente.");
  const next = await d.repo.profiles.update(profileId, approve ? { role: "mentor", mentorStatus: "approved" } : { mentorStatus: "rejected" });
  await audit(d, approve ? "mentor.approved" : "mentor.rejected", { targetId: profileId });
  return next;
}
