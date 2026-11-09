import type { Workspace } from "@/lib/services/projects";
import { isCurrent } from "@/features/diagnosis/rules";
import { usesB2BStages } from "@/features/projects/stages";
import { isB2BFlow } from "@/lib/flags";

/**
 * Recorrido completo de un proyecto, del paso cero a la conclusión, tal como lo puede llevar el
 * agente. Cada paso dice quién lo hace, si ya se cumplió (derivado de los datos reales, no de lo que
 * diga la conversación) y con qué acción del agente se puede dar desde el chat.
 *
 * Mantener alineado con features/projects/phase.ts (derivePhase) y con las acciones de
 * lib/services/agent-actions.ts.
 */

export type JourneyOwner = "entrepreneur" | "mentor" | "admin" | "both";

export interface JourneyStep {
  id: string;
  label: string;
  owner: JourneyOwner;
  done: boolean;
  /** Pasos que enriquecen el ciclo pero no lo frenan (acuerdo, objetivos, evaluación). */
  optional?: boolean;
  /** Cómo se da este paso desde el chat: herramienta o acción de propose_step_action. */
  how: string;
}

export interface Journey {
  steps: JourneyStep[];
  /** Índice del primer paso obligatorio pendiente; igual a steps.length si el ciclo terminó. */
  currentIndex: number;
  finished: boolean;
  /** Recorrido del flujo B2B (Entrevista → Sesión 1 → Ciclo → Cierre). Sin valor = flujo viejo. */
  flow?: "b2b";
}

const LIVE = (s: string) => s !== "discarded" && s !== "reformulated";
const PAST_APPROVAL = ["approved", "testing", "supported", "weakened", "inconclusive"];

/** Proyecto del flujo B2B: con mentor dueño (mentor_id) y la bandera encendida. */
export const isB2BWorkspace = (w: Pick<Workspace, "project">, b2bFlow: boolean = isB2BFlow()): boolean => usesB2BStages(w.project, b2bFlow);

/** El recorrido que corresponde al proyecto: el B2B si es del flujo nuevo, el de siempre si no. */
export function buildJourney(w: Workspace): Journey {
  return isB2BWorkspace(w) ? buildB2BJourney(w) : buildLegacyJourney(w);
}

/**
 * Recorrido B2B: el cliente responde la entrevista, el mentor agenda y conduce la Sesión 1 (acuerdo y
 * objetivos), después las sesiones del ciclo con su agenda y compromisos, y el cierre. La etapa sale de
 * `projects.cycle_stage`; los pasos, de las sesiones y el acuerdo reales.
 */
export function buildB2BJourney(w: Workspace): Journey {
  const stage = w.project.cycleStage ?? "intake";
  const reached = (s: typeof stage) => ["intake", "kickoff", "cycle", "closed"].indexOf(stage) >= ["intake", "kickoff", "cycle", "closed"].indexOf(s);
  const kickoff = w.sessions.filter((s) => s.kind === "kickoff");
  const followUps = w.sessions.filter((s) => s.kind === "follow_up");
  const agreement = [...w.mentorshipAgreements].sort((a, b) => b.version - a.version)[0];
  const kickoffDone = kickoff.some((s) => s.status === "completed");
  const steps: JourneyStep[] = [
    {
      id: "intake",
      label: "Responder la entrevista de intake (cada persona cliente)",
      owner: "entrepreneur",
      done: reached("kickoff") || kickoff.length > 0,
      how: "En la pestaña Entrevista del proyecto (/intake): el asistente pregunta lo que necesita el mentor y al final se envía",
    },
    {
      id: "review_brief",
      label: "Leer el brief del intake y completar el contexto que falta",
      owner: "mentor",
      optional: true,
      done: Boolean(w.project.clientContext?.trim()),
      how: "En la pestaña Brief del proyecto (/brief), con «Marcar revisado»",
    },
    {
      id: "schedule_kickoff",
      label: "Agendar la Sesión 1 (acuerdos)",
      owner: "mentor",
      done: kickoffDone || kickoff.some((s) => Boolean(s.scheduledAt)),
      how: "En el inicio del proyecto o en Sesiones: elegir fecha y hora; el cliente confirma su asistencia",
    },
    {
      id: "kickoff",
      label: "Sesión 1: conocer el caso, acordar la forma de trabajo y los objetivos",
      owner: "mentor",
      done: kickoffDone,
      how: "Desde la sala de la llamada (/app/llamada/<sesión>): notas en vivo, acuerdo y objetivos; al cerrar la sesión el proyecto pasa a «Ciclo»",
    },
    {
      id: "agreement",
      label: "Confirmar el acuerdo de trabajo",
      owner: "both",
      optional: true,
      done: agreement?.status === "active",
      how: "En la sala de la Sesión 1; después se ve en Sesiones (solo lectura para el cliente)",
    },
    {
      id: "goals",
      label: "Definir los objetivos del ciclo",
      owner: "mentor",
      optional: true,
      done: w.mentorshipGoals.length > 0,
      how: "En la sala de la Sesión 1",
    },
    {
      id: "schedule_follow_up",
      label: "Agendar la siguiente sesión del ciclo (queda sugerida con los temas pendientes)",
      owner: "mentor",
      done: followUps.some((s) => Boolean(s.scheduledAt)),
      how: "En Sesiones: ponerle fecha a la sesión sugerida y ajustar su agenda de temas",
    },
    {
      id: "commitments",
      label: "Avanzar con los compromisos entre sesiones",
      owner: "entrepreneur",
      optional: true,
      done: w.tasks.length > 0 && w.tasks.every((t) => t.status === "done"),
      how: "Los compromisos salen de cada sesión; se ven en el inicio del proyecto",
    },
    {
      id: "follow_up",
      label: "Sesiones del ciclo: revisar avances y los temas de la agenda",
      owner: "mentor",
      done: followUps.some((s) => s.status === "completed"),
      how: "En la sala de cada sesión; al cerrarla, lo que no se cubrió pasa a la siguiente",
    },
    {
      id: "close_cycle",
      label: "Cerrar el ciclo",
      owner: "mentor",
      done: stage === "closed",
      how: "Lo decide el mentor cuando se cumplieron los objetivos",
    },
  ];
  const currentIndex = steps.findIndex((s) => !s.done && !s.optional);
  return { steps, currentIndex: currentIndex === -1 ? steps.length : currentIndex, finished: currentIndex === -1, flow: "b2b" };
}

function buildLegacyJourney(w: Workspace): Journey {
  const items = w.items.filter(isCurrent);
  const sessions = (kind: string) => w.sessions.filter((s) => s.kind === kind);
  const first = sessions("first_review");
  const second = sessions("second_review");
  const liveHyps = w.hypotheses.filter((h) => LIVE(h.status));
  const agreement = [...w.mentorshipAgreements].sort((a, b) => b.version - a.version)[0];

  const steps: JourneyStep[] = [
    {
      id: "describe",
      label: "Contar la idea o el proyecto y registrar hallazgos en el diagnóstico",
      owner: "entrepreneur",
      done: items.length > 0 || Boolean(w.diagnosis.summary),
      how: "Conversar; con información nueva usa extract_diagnosis_items",
    },
    {
      id: "draft_summary",
      label: "Redactar el resumen del diagnóstico",
      owner: "entrepreneur",
      done: Boolean(w.diagnosis.summary),
      how: "update_context_memory o propose_step_action set_summary",
    },
    {
      id: "confirm_summary",
      label: "Confirmar el resumen (solo la persona dueña)",
      owner: "entrepreneur",
      done: Boolean(w.diagnosis.summaryConfirmedAt),
      how: "propose_step_action confirm_summary",
    },
    {
      id: "assign_mentor",
      label: "Tener mentor asignado (lo hace administración)",
      owner: "admin",
      done: w.mentors.length > 0,
      how: "No se hace desde el chat: administración asigna el mentor en /app/admin",
    },
    {
      id: "request_first_review",
      label: "Pedir la primera revisión al mentor",
      owner: "entrepreneur",
      done: first.length > 0,
      how: "propose_step_action request_review (kind first_review y scheduledAt con fecha y hora); queda pendiente hasta que el mentor la confirma",
    },
    {
      id: "first_review",
      label: "Primera revisión: el mentor orienta el enfoque y registra el acuerdo",
      owner: "mentor",
      done: first.some((s) => s.status === "completed"),
      how: "Mentor: propose_step_action confirm_session (confirmar o cambiar la fecha), después add_session_note y complete_first_review",
    },
    {
      id: "prioritize_problem",
      label: "Priorizar el problema a investigar primero",
      owner: "both",
      done: items.some((i) => i.category === "problem" && i.priority),
      how: "propose_step_action prioritize_problem (si no hay problemas en el diagnóstico, primero extract_diagnosis_items)",
    },
    {
      id: "agreement",
      label: "Acordar la mentoría (frecuencia, alcance, compromisos) y confirmarla ambas partes",
      owner: "both",
      optional: true,
      done: agreement?.status === "active",
      how: "propose_step_action save_agreement y luego confirm_agreement",
    },
    {
      id: "goals",
      label: "Definir objetivos del ciclo",
      owner: "both",
      optional: true,
      done: w.mentorshipGoals.length > 0,
      how: "propose_goals",
    },
    {
      id: "propose_hypothesis",
      label: "Formular una hipótesis comprobable y enviarla a aprobación",
      owner: "both",
      done: liveHyps.some((h) => h.status !== "draft"),
      how: "design_experiment (solo hipótesis) y luego propose_step_action submit_hypothesis",
    },
    {
      id: "approve_hypothesis",
      label: "El mentor aprueba la hipótesis (o la devuelve o descarta)",
      owner: "mentor",
      done: liveHyps.some((h) => PAST_APPROVAL.includes(h.status)),
      how: "Mentor: propose_step_action decide_hypothesis",
    },
    {
      id: "design_experiment",
      label: "Diseñar el experimento con métrica y criterios de éxito y descarte",
      owner: "both",
      done: w.experiments.length > 0,
      how: "design_experiment con hypothesisId de una hipótesis aprobada",
    },
    {
      id: "start_experiment",
      label: "Iniciar el experimento (bloquea los criterios)",
      owner: "entrepreneur",
      done: w.experiments.some((e) => e.status !== "design" && e.status !== "ready"),
      how: "propose_step_action start_experiment; las tareas con propose_tasks",
    },
    {
      id: "record_result",
      label: "Ejecutar, cargar evidencia y registrar el resultado",
      owner: "entrepreneur",
      done: w.results.length > 0,
      how: "propose_step_action add_evidence, set_task_status y record_result",
    },
    {
      id: "request_second_review",
      label: "Pedir la segunda revisión al mentor",
      owner: "entrepreneur",
      done: second.length > 0,
      how: "propose_step_action request_review (kind second_review y scheduledAt con fecha y hora); queda pendiente hasta que el mentor la confirma",
    },
    {
      id: "mentor_decision",
      label: "Segunda revisión: el mentor decide continuar, reformular, profundizar, pausar o descartar",
      owner: "mentor",
      done: second.some((s) => s.status === "completed"),
      how: "Mentor: propose_step_action confirm_session (confirmar o cambiar la fecha) y, en la revisión, mentor_decision",
    },
    {
      id: "evaluate_cycle",
      label: "Evaluar el ciclo de mentoría (cierre)",
      owner: "both",
      optional: true,
      done: w.cycleEvaluations.length > 0,
      how: "evaluate_mentorship_cycle",
    },
  ];

  const currentIndex = steps.findIndex((s) => !s.done && !s.optional);
  return { steps, currentIndex: currentIndex === -1 ? steps.length : currentIndex, finished: currentIndex === -1 };
}

const LEGACY_OWNER_LABEL: Record<JourneyOwner, string> = {
  entrepreneur: "emprendedor/a",
  mentor: "mentor",
  admin: "administración",
  both: "emprendedor/a o mentor",
};

const B2B_OWNER_LABEL: Record<JourneyOwner, string> = {
  entrepreneur: "cliente",
  mentor: "mentor",
  admin: "administración",
  both: "cliente o mentor",
};

/** Lista compacta para el prompt: ✓ hecho, → paso actual, · pendiente. */
export function renderJourney(j: Journey, viewerIsMentor: boolean): string {
  const OWNER_LABEL = j.flow === "b2b" ? B2B_OWNER_LABEL : LEGACY_OWNER_LABEL;
  const viewer = viewerIsMentor ? "mentor" : "entrepreneur";
  const required = j.steps.filter((s) => !s.optional);
  const doneRequired = required.filter((s) => s.done).length;
  const lines = j.steps.map((s, i) => {
    const mark = s.done ? "✓" : i === j.currentIndex ? "→" : "·";
    const mine = s.owner === viewer || s.owner === "both";
    return `  ${mark} ${i + 1}. ${s.label} [${OWNER_LABEL[s.owner]}${s.optional ? ", opcional" : ""}]${!s.done ? ` — ${mine ? s.how : "le corresponde a otra persona"}` : ""}`;
  });
  const current = j.steps[j.currentIndex];
  const head = j.finished
    ? `Recorrido: ciclo completo (${doneRequired}/${required.length} pasos obligatorios).`
    : `Recorrido: paso ${j.currentIndex + 1} de ${j.steps.length} (${doneRequired}/${required.length} obligatorios hechos). Paso actual: «${current.label}», le toca a ${OWNER_LABEL[current.owner]}${current.owner === viewer || current.owner === "both" ? " (a quien conversa)" : ""}.`;
  return `${head}\n${lines.join("\n")}`;
}
