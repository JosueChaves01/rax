import type { CycleStage, IntakeStatus, InvitationStatus, ProjectMode } from "@/types/b2b";

/** Textos del flujo B2B del lado del mentor (Clientes y brief). */

export const CYCLE_STAGE_LABEL: Record<CycleStage, string> = {
  intake: "Intake",
  kickoff: "Sesión 1",
  cycle: "Ciclo",
  closed: "Cerrado",
};

export const MODE_LABEL: Record<ProjectMode, string> = { individual: "Individual", group: "Grupal" };

export const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptó",
  declined: "Rechazó",
  revoked: "Revocada",
};

export const INVITATION_STATUS_COLOR: Record<InvitationStatus, string> = {
  pending: "#d97706",
  accepted: "#059669",
  declined: "#64748b",
  revoked: "#64748b",
};

export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  not_started: "Sin empezar",
  in_progress: "En curso",
  submitted: "Listo para revisar",
  reviewed: "Revisado",
};

export const INTAKE_STATUS_COLOR: Record<IntakeStatus, string> = {
  not_started: "#64748b",
  in_progress: "#0284c7",
  submitted: "#d97706",
  reviewed: "#059669",
};
