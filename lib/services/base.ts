import type { AuditAction, AuditEvent, DiagnosisItem, DiagnosisItemHistory, Id, ItemChangeKind, Profile, Project } from "@/types/domain";
import type { Repository } from "@/lib/data/repository";
import type { AiProvider } from "@/lib/ai/provider";
import { assertCan, type Action, type ProjectRelation } from "@/lib/authz";
import { forbidden, notFound } from "@/lib/errors";

export interface ServiceDeps {
  repo: Repository;
  ai: AiProvider;
  actor: Profile;
  now: () => string;
  newId: (prefix: string) => string;
}

export const defaultClock = () => new Date().toISOString();
export const randomId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Resuelve la relación del actor con el proyecto desde la base de datos, nunca desde el cliente. */
export async function relationOf(d: ServiceDeps, projectId: Id): Promise<ProjectRelation> {
  const project = await d.repo.projects.get(projectId);
  if (!project) return { isOwner: false, isCollaborator: false, isAssignedMentor: false };
  const [members, assignments] = await Promise.all([
    d.repo.projectMembers.list({ projectId, profileId: d.actor.id }),
    d.repo.mentorAssignments.list({ projectId, mentorId: d.actor.id, status: "active" }),
  ]);
  return {
    isOwner: project.ownerId === d.actor.id,
    isCollaborator: members.some((m) => m.role === "collaborator"),
    isAssignedMentor: assignments.length > 0,
  };
}

/**
 * Carga el proyecto y verifica el permiso. Un proyecto ajeno responde igual que uno inexistente
 * (no revela su existencia) y deja registro del intento.
 */
export async function guard(d: ServiceDeps, projectId: Id, action: Action): Promise<{ project: Project; rel: ProjectRelation }> {
  const project = await d.repo.projects.get(projectId);
  const rel = await relationOf(d, projectId);
  const canRead = rel.isOwner || rel.isCollaborator || rel.isAssignedMentor;
  if (!project || !canRead) {
    if (project) await audit(d, "access.denied", { projectId, meta: { action } });
    throw notFound("Este proyecto no existe o no tenés acceso.");
  }
  try {
    assertCan(d.actor, action, rel);
  } catch (e) {
    await audit(d, "access.denied", { projectId, meta: { action } });
    throw e;
  }
  return { project, rel };
}

export async function audit(
  d: ServiceDeps,
  action: AuditAction,
  opts: { projectId?: Id; targetId?: Id; meta?: AuditEvent["meta"]; actorId?: AuditEvent["actorId"] } = {},
) {
  await d.repo.auditEvents.insert({
    id: d.newId("aud"),
    action,
    actorId: opts.actorId ?? d.actor.id,
    projectId: opts.projectId,
    targetId: opts.targetId,
    meta: opts.meta,
    createdAt: d.now(),
  });
}

const snapshot = (i: DiagnosisItem): Omit<DiagnosisItem, "id" | "projectId"> => {
  const { id: _id, projectId: _p, ...rest } = i;
  void _id;
  void _p;
  return rest;
};

export async function recordHistory(
  d: ServiceDeps,
  before: DiagnosisItem | null,
  after: DiagnosisItem,
  change: ItemChangeKind,
  actorId: Id | "ai",
  reason?: string,
) {
  const row: DiagnosisItemHistory = {
    id: d.newId("hist"),
    itemId: after.id,
    projectId: after.projectId,
    version: after.version,
    change,
    before: before ? snapshot(before) : null,
    after: snapshot(after),
    actorId,
    reason,
    createdAt: d.now(),
  };
  await d.repo.diagnosisItemHistory.insert(row);
}

export function requireRole(d: ServiceDeps, role: Profile["role"]) {
  if (d.actor.role !== role) throw forbidden();
}
