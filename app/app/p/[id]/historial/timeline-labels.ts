import type { AuditAction, DiagnosisItemHistory } from "@/types/domain";

export const CHANGE_TEXT: Record<DiagnosisItemHistory["change"], string> = {
  created: "registró",
  edited: "corrigió",
  confirmed: "confirmó",
  rejected: "rechazó",
  clarification_requested: "pidió aclarar",
  marked_unknown: "marcó como desconocido",
  evidence_attached: "adjuntó evidencia a",
  prioritized: "priorizó",
};

type Meta = Record<string, string | number | boolean>;

export const AUDIT_TEXT: Partial<Record<AuditAction, (m: Meta) => string>> = {
  "project.created": () => "creó el proyecto",
  "project.status_changed": (m) => ("shareConversationWithMentor" in m ? (m.shareConversationWithMentor ? "compartió la conversación con el mentor" : "dejó de compartir la conversación") : `cambió el estado del proyecto a ${m.to}`),
  "mentor.assigned": () => "asignó un mentor",
  "mentor.revoked": () => "revocó una asignación de mentor",
  "diagnosis.summary_confirmed": () => "confirmó el resumen inicial",
  "mentor.session_completed": (m) => (m.kind === "first_review" ? "completó la primera revisión" : `completó la segunda revisión (${m.decision})`),
  "hypothesis.status_changed": (m) => `movió una hipótesis de ${m.from} a ${m.to}`,
  "experiment.status_changed": (m) => `movió un experimento de ${m.from} a ${m.to}`,
  "experiment.result_recorded": (m) => `registró un resultado (${m.outcome})`,
  "evidence.added": () => "agregó evidencia",
  "ai.invoked": (m) => `procesó un mensaje con ${m.provider === "simulated" ? "la simulación" : `el modelo ${m.model}`} (${m.proposals} propuestas)`,
  "ai.failed": (m) => `no pudo usar la IA (${m.reason})`,
  "access.denied": (m) => `bloqueó un acceso no autorizado (${m.action})`,
};
