import type { Profile } from "@/types/domain";
import { forbidden } from "./errors";

/**
 * Matriz de permisos de RAX. Se evalúa SIEMPRE en el servidor (servicios),
 * y se replica en las políticas RLS de supabase/migrations. Ocultar un botón no es seguridad.
 */
export type Action =
  | "project.read"
  | "project.update"
  | "conversation.write"
  | "diagnosis.edit"
  | "diagnosis.confirm_summary"
  | "diagnosis.comment"
  | "diagnosis.request_clarification"
  | "diagnosis.prioritize"
  | "mentor.request_review"
  | "mentor.note"
  | "mentor.decide"
  | "hypothesis.propose"
  | "hypothesis.approve"
  | "experiment.design"
  | "experiment.start"
  | "experiment.record_result"
  | "evidence.add"
  | "task.manage"
  | "mentorship.manage"
  | "agreement.edit"
  | "agreement.confirm"
  | "goal.manage"
  | "roadmap.manage"
  | "task.diagnose_delay"
  | "cycle.evaluate"
  | "resource.manage"
  | "admin.manage";

/** Relación del actor con el proyecto, resuelta desde la base de datos (nunca desde el cliente). */
export interface ProjectRelation {
  isOwner: boolean;
  isCollaborator: boolean;
  isAssignedMentor: boolean;
}

export const NO_RELATION: ProjectRelation = { isOwner: false, isCollaborator: false, isAssignedMentor: false };

type Who = "owner" | "collaborator" | "mentor";

const MATRIX: Record<Exclude<Action, "admin.manage">, Who[]> = {
  "project.read": ["owner", "collaborator", "mentor"],
  "project.update": ["owner"],
  "conversation.write": ["owner", "collaborator"],
  "diagnosis.edit": ["owner", "collaborator"],
  "diagnosis.confirm_summary": ["owner"],
  "diagnosis.comment": ["owner", "collaborator", "mentor"],
  "diagnosis.request_clarification": ["owner", "collaborator", "mentor"],
  "diagnosis.prioritize": ["owner", "mentor"],
  "mentor.request_review": ["owner"],
  "mentor.note": ["mentor"],
  "mentor.decide": ["mentor"],
  "hypothesis.propose": ["owner", "collaborator", "mentor"],
  "hypothesis.approve": ["mentor"],
  "experiment.design": ["owner", "collaborator", "mentor"],
  "experiment.start": ["owner"],
  "experiment.record_result": ["owner", "collaborator"],
  "evidence.add": ["owner", "collaborator"],
  "task.manage": ["owner", "collaborator", "mentor"],
  "mentorship.manage": ["owner", "mentor"],
  "agreement.edit": ["owner", "mentor"],
  "agreement.confirm": ["owner", "mentor"],
  "goal.manage": ["owner", "mentor"],
  "roadmap.manage": ["owner", "mentor"],
  "task.diagnose_delay": ["owner", "mentor"],
  "cycle.evaluate": ["owner", "mentor"],
  "resource.manage": ["owner", "mentor"],
};

export function can(actor: Profile, action: Action, rel: ProjectRelation = NO_RELATION): boolean {
  if (action === "admin.manage") return actor.role === "admin";
  // El administrador gestiona usuarios y asignaciones, pero no lee el contenido de proyectos ajenos.
  const allowed = MATRIX[action];
  return (
    (rel.isOwner && allowed.includes("owner")) ||
    (rel.isCollaborator && allowed.includes("collaborator")) ||
    (rel.isAssignedMentor && actor.role === "mentor" && allowed.includes("mentor"))
  );
}

export function assertCan(actor: Profile, action: Action, rel?: ProjectRelation): void {
  if (!can(actor, action, rel)) throw forbidden();
}
