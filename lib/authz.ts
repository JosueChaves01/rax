import type { Profile } from "@/types/domain";
import { forbidden } from "./errors";

/**
 * Matriz de permisos de RAX. Se evalúa SIEMPRE en el servidor (servicios),
 * y se replica en las políticas RLS de supabase/migrations. Ocultar un botón no es seguridad.
 */
export type Action =
  | "project.read"
  | "project.update"
  | "project.delete"
  | "conversation.write"
  | "agent.chat"
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
  | "admin.manage"
  /* Pivot B2B (plan técnico §2 y §6). Sin efecto en el flujo actual hasta que los servicios nuevos las usen. */
  | GlobalB2BAction
  | "invitation.send"
  | "session.live_notes"
  | "document.publish"
  | "intake.run"
  | "intake.review"
  | "cycle.schedule"
  | "assessment.manage"
  | "assessment.submit"
  | "resource.read"
  | "resource.comment";

/** Acciones B2B que no dependen de un proyecto: se deciden por el rol de la persona. */
export type GlobalB2BAction =
  | "mentor.profile"
  | "mentor.knowledge"
  | "project.create_as_mentor"
  | "invitation.respond"
  | "notification.read";

/** Relación del actor con el proyecto, resuelta desde la base de datos (nunca desde el cliente). */
export interface ProjectRelation {
  isOwner: boolean;
  isCollaborator: boolean;
  isAssignedMentor: boolean;
  /** Pivot B2B: mentor dueño operativo (projects.mentor_id) o con asignación activa. */
  isProjectMentor?: boolean;
  /** Pivot B2B: persona invitada que aceptó (project_members.role = client). */
  isClient?: boolean;
}

export const NO_RELATION: ProjectRelation = { isOwner: false, isCollaborator: false, isAssignedMentor: false };

type Who = "owner" | "collaborator" | "mentor" | "client";

const GLOBAL_B2B: Record<GlobalB2BAction, (actor: Profile) => boolean> = {
  "mentor.profile": (a) => a.role === "mentor",
  "mentor.knowledge": (a) => a.role === "mentor",
  "project.create_as_mentor": (a) => a.role === "mentor",
  // Cualquier persona con sesión responde sus invitaciones y lee sus notificaciones (el servicio filtra por correo e id).
  "invitation.respond": () => true,
  "notification.read": () => true,
};

const isGlobalB2B = (action: Action): action is GlobalB2BAction => action in GLOBAL_B2B;

const MATRIX: Record<Exclude<Action, "admin.manage" | GlobalB2BAction>, Who[]> = {
  "project.read": ["owner", "collaborator", "mentor"],
  "project.update": ["owner"],
  "project.delete": ["owner"],
  "conversation.write": ["owner", "collaborator"],
  "agent.chat": ["owner", "collaborator", "mentor"],
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
  "invitation.send": ["mentor"],
  "session.live_notes": ["mentor"],
  "document.publish": ["mentor"],
  "intake.run": ["client"],
  "intake.review": ["mentor"],
  "cycle.schedule": ["mentor"],
  "assessment.manage": ["mentor"],
  "assessment.submit": ["client"],
  "resource.read": ["mentor", "client"],
  "resource.comment": ["mentor", "client"],
};

export function can(actor: Profile, action: Action, rel: ProjectRelation = NO_RELATION): boolean {
  if (action === "admin.manage") return actor.role === "admin";
  if (isGlobalB2B(action)) return GLOBAL_B2B[action](actor);
  // El administrador gestiona usuarios y asignaciones, pero no lee el contenido de proyectos ajenos.
  const allowed = MATRIX[action];
  return (
    (rel.isOwner && actor.role === "entrepreneur" && allowed.includes("owner")) ||
    (rel.isCollaborator && actor.role === "entrepreneur" && allowed.includes("collaborator")) ||
    ((rel.isAssignedMentor || rel.isProjectMentor === true) && actor.role === "mentor" && allowed.includes("mentor")) ||
    (rel.isClient === true && actor.role !== "mentor" && allowed.includes("client"))
  );
}

export function assertCan(actor: Profile, action: Action, rel?: ProjectRelation): void {
  if (!can(actor, action, rel)) throw forbidden();
}
