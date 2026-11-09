import type { Workspace } from "@/lib/services/projects";
import { localIsoWithOffset, longLocalDateTime } from "@/lib/dates";
import type { Role } from "@/types/domain";
import { b2bStageOf, stageOf } from "@/features/projects/stages";
import { isCurrent } from "@/features/diagnosis/rules";
import {
  AGREEMENT_FREQUENCY_LABEL,
  AGREEMENT_STATUS_LABEL,
  CATEGORY_LABEL,
  DECISION_LABEL,
  EXPERIMENT_STATUS_LABEL,
  GOAL_PRIORITY_LABEL,
  GOAL_STATUS_LABEL,
  HYPOTHESIS_STATUS_LABEL,
  NATURE_LABEL,
  OUTCOME_LABEL,
  PHASE_LABEL,
  REVIEW_LABEL,
  SESSION_KIND_LABEL,
  TASK_STATUS_LABEL,
} from "@/features/labels";
import { nextAction } from "@/lib/services/next-action";
import { buildJourney, renderJourney, type Journey } from "./journey";

/**
 * Estado del proyecto que ve el agente en cada turno. Se arma en el servidor desde el espacio de
 * trabajo autorizado (getWorkspace), nunca desde lo que mande el navegador, así que respeta los mismos
 * permisos y privacidad que las pantallas: notas privadas de otros y la conversación no compartida
 * con el mentor quedan fuera.
 */
export interface ProjectStateSnapshot {
  projectId: string;
  projectName: string;
  description: string;
  nature: string;
  viewerRole: Role;
  viewerIsMentor: boolean;
  stage: { id: string; label: string; question: string };
  phase: { id: string; label: string };
  next: { text: string; page: string; turn: string };
  diagnosis: {
    summary: string | null;
    summaryConfirmed: boolean;
    counts: { total: number; confirmed: number; proposed: number; needsClarification: number; openQuestions: number };
    prioritizedProblem: string | null;
    highlights: string[];
    /** Problemas vigentes con su id, para priorizar desde el chat. */
    problems: string[];
    /** Hallazgos propuestos sin revisar, con su id. */
    pendingReview: string[];
  };
  journey: Journey;
  relation: string | null;
  mentors: string[];
  owner: string | null;
  sessions: { upcoming: string[]; lastCompleted: string | null; recentNotes: string[]; lastSynthesis?: string | null };
  evaluations: string[];
  agreement: string | null;
  goals: string[];
  hypotheses: string[];
  experiments: string[];
  tasks: { total: number; done: number; open: string[]; blocked: string[]; overdue: string[] };
  evidenceCount: number;
  permissions: string[];
  /** Proyecto del flujo B2B (Entrevista → Sesión 1 → Ciclo → Cierre). Sin valor = flujo viejo. */
  flow?: "b2b";
  /** B2B: sesiones numeradas con los temas de su agenda. */
  cycleSessions?: string[];
}

const LIMITS = { highlights: 12, goals: 8, hypotheses: 6, experiments: 6, openTasks: 10, blockedTasks: 6, upcoming: 3, sessionNotes: 8, problems: 8, pendingReview: 8 } as const;

const NOTE_KIND_LABEL: Record<string, string> = {
  observation: "Observación",
  question: "Pregunta",
  suggestion: "Sugerencia",
  agreement: "Acuerdo",
  commitment: "Compromiso",
  blocker: "Bloqueo",
  decision: "Decisión",
};

const clip = (s: string | undefined | null, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const day = (iso?: string) => (iso ? iso.slice(0, 10) : "sin fecha");

const B2B_PAGE: Record<string, string> = {
  intake: "intake",
  review_brief: "brief",
  schedule_kickoff: "sesiones",
  kickoff: "sesiones",
  agreement: "sesiones",
  goals: "sesiones",
  schedule_follow_up: "sesiones",
  commitments: "",
  follow_up: "sesiones",
  close_cycle: "sesiones",
};

/** Etapa, fase y siguiente paso de un proyecto B2B: salen de cycle_stage y del recorrido B2B. */
function b2bHeadline(w: Workspace, journey: Journey) {
  const stage = b2bStageOf(w.project.cycleStage);
  const step = journey.steps[journey.currentIndex];
  return {
    stage: { id: stage.id, label: stage.label, question: stage.question },
    phase: { id: stage.id, label: `${stage.label} (etapa ${stage.n} de 4)` },
    next: step
      ? { text: step.label, page: B2B_PAGE[step.id] ?? "", turn: step.owner === "entrepreneur" ? "client" : step.owner }
      : { text: "El ciclo está cerrado.", page: "", turn: "none" },
  };
}

/** Sesiones de un proyecto B2B con número y temas de la agenda (lo que el agente necesita para preparar). */
function b2bSessionLines(w: Workspace): string[] {
  return [...w.sessions]
    .filter((s) => s.kind === "kickoff" || s.kind === "follow_up")
    .sort((a, b) => (a.sessionNumber ?? 99) - (b.sessionNumber ?? 99) || a.createdAt.localeCompare(b.createdAt))
    .slice(-6)
    .map((s) => {
      const when = s.status === "completed" ? `realizada ${day(s.completedAt)}` : s.status === "in_progress" ? "en curso" : s.scheduledAt ? `agendada ${longLocalDateTime(s.scheduledAt)}` : "por agendar";
      const topics = (s.agenda ?? []).slice(0, 8).map((t) => `${clip(t.title, 80)}${t.status === "covered" ? " ✓" : t.status === "carried_over" ? " (pasa a la próxima)" : ""}`);
      return `[${s.id}] Sesión ${s.sessionNumber ?? "?"} · ${SESSION_KIND_LABEL[s.kind]} (${when})${topics.length ? ` · temas: ${topics.join("; ")}` : ""}`;
    });
}

export function buildProjectState(w: Workspace, viewerRole: Role, today: string): ProjectStateSnapshot {
  const journey = buildJourney(w);
  if (journey.flow === "b2b") return { ...buildBaseState(w, viewerRole, today, journey), ...b2bHeadline(w, journey), flow: "b2b", cycleSessions: b2bSessionLines(w) };
  return buildBaseState(w, viewerRole, today, journey);
}

function buildBaseState(w: Workspace, viewerRole: Role, today: string, journey: Journey): ProjectStateSnapshot {
  const stage = stageOf(w.phase);
  const next = journey.flow === "b2b" ? { text: "", tab: "", turn: "none" } : nextAction(w);
  const current = w.items.filter(isCurrent);
  const problem = current
    .filter((i) => i.category === "problem" && i.priority)
    .sort((a, b) => (a.priority!.rank ?? 0) - (b.priority!.rank ?? 0))[0];
  // Lo que confirmaron o corrigieron las personas va primero: prevalece sobre interpretaciones de la IA.
  const weight = (s: string) => (s === "confirmed" || s === "corrected" ? 0 : s === "needs_clarification" ? 1 : 2);
  const highlights = [...current]
    .sort((a, b) => weight(a.reviewStatus) - weight(b.reviewStatus) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LIMITS.highlights)
    .map((i) => `[${CATEGORY_LABEL[i.category]} · ${REVIEW_LABEL[i.reviewStatus]}] ${clip(i.title, 120)}: ${clip(i.content, 220)}`);

  const name = (id: string) => w.people[id]?.name ?? "otra persona";
  const when = (s: Workspace["sessions"][number]) => {
    if (s.status === "completed") return `realizada ${day(s.completedAt)}`;
    if (!s.scheduledAt) return "pedida sin fecha: el mentor debe proponer fecha y hora para confirmarla";
    const at = `${longLocalDateTime(s.scheduledAt)} (${localIsoWithOffset(s.scheduledAt)})`;
    return s.confirmedAt ? `confirmada por el mentor para el ${at}` : `fecha pedida ${at}, falta que el mentor la confirme`;
  };
  const sessionLine = (s: Workspace["sessions"][number]) =>
    `[${s.id}] ${SESSION_KIND_LABEL[s.kind]} con ${name(s.mentorId)} (${when(s)}${s.status === "in_progress" ? ", en curso" : ""})${s.decision ? ` · decisión: ${DECISION_LABEL[s.decision.value].toLowerCase()}` : ""}`;
  const upcoming = w.sessions
    .filter((s) => s.status !== "completed")
    .sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt))
    .slice(0, LIMITS.upcoming)
    .map(sessionLine);
  const lastCompleted = [...w.sessions]
    .filter((s) => s.status === "completed")
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))[0];

  const agreement = [...w.mentorshipAgreements].sort((a, b) => b.version - a.version)[0];
  const tasks = w.tasks;
  const openTasks = tasks.filter((t) => t.status === "todo" || t.status === "doing");
  const taskLine = (t: (typeof tasks)[number]) => `[${t.id}] ${clip(t.title, 120)} (${TASK_STATUS_LABEL[t.status]}${t.dueDate ? `, vence ${day(t.dueDate)}` : ""})`;

  return {
    projectId: w.project.id,
    projectName: w.project.name,
    description: clip(w.project.description, 500),
    nature: NATURE_LABEL[w.project.nature] ?? w.project.nature,
    viewerRole,
    viewerIsMentor: w.isMentorView,
    stage: { id: stage.id, label: stage.label, question: stage.question },
    phase: { id: w.phase, label: PHASE_LABEL[w.phase] },
    next: { text: next.text, page: next.tab, turn: next.turn },
    diagnosis: {
      summary: w.diagnosis.summary ? clip(w.diagnosis.summary, 1200) : null,
      summaryConfirmed: Boolean(w.diagnosis.summaryConfirmedAt),
      counts: {
        total: current.length,
        confirmed: current.filter((i) => i.reviewStatus === "confirmed" || i.reviewStatus === "corrected").length,
        proposed: current.filter((i) => i.reviewStatus === "proposed").length,
        needsClarification: current.filter((i) => i.reviewStatus === "needs_clarification").length,
        openQuestions: current.filter((i) => i.category === "open_question").length,
      },
      prioritizedProblem: problem ? `${clip(problem.title, 140)} — ${clip(problem.priority!.rationale, 200)}` : null,
      highlights,
      problems: current
        .filter((i) => i.category === "problem")
        .slice(0, LIMITS.problems)
        .map((i) => `[${i.id}] ${clip(i.title, 140)}${i.priority ? ` (prioridad ${i.priority.rank})` : ""}`),
      pendingReview: current
        .filter((i) => i.reviewStatus === "proposed" || i.reviewStatus === "needs_clarification")
        .slice(0, LIMITS.pendingReview)
        .map((i) => `[${i.id}] ${CATEGORY_LABEL[i.category]}: ${clip(i.title, 120)} (${REVIEW_LABEL[i.reviewStatus]})`),
    },
    journey,
    relation: w.mentorshipRelation ? `[${w.mentorshipRelation.id}] etapa ${w.mentorshipRelation.stage}` : null,
    evaluations: w.cycleEvaluations.map((e) => `Ciclo ${e.cycleNumber}: decisión ${e.decision}`),
    mentors: w.mentors.map(name),
    owner: w.people[w.project.ownerId]?.name ?? null,
    sessions: {
      upcoming,
      lastCompleted: lastCompleted ? sessionLine(lastCompleted) : null,
      // Notas visibles para quien conversa (las privadas de otra persona ya vienen filtradas).
      recentNotes: [...(w.notes ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, LIMITS.sessionNotes)
        .map((n) => `[nota ${n.id} · sesión ${n.sessionId}] ${NOTE_KIND_LABEL[n.kind] ?? n.kind}: ${clip(n.body, 200)} (${day(n.createdAt)})`),
      lastSynthesis: lastSynthesisLine(w.sessions),
    },
    agreement: agreement
      ? `[${agreement.id}] ${AGREEMENT_STATUS_LABEL[agreement.status]} · frecuencia ${AGREEMENT_FREQUENCY_LABEL[agreement.frequency].toLowerCase()}, ${agreement.sessionDurationMinutes} min · alcance: ${clip(agreement.scope, 200)}`
      : null,
    goals: w.mentorshipGoals.slice(0, LIMITS.goals).map((g) => `[${g.id}] ${clip(g.title, 120)} (${GOAL_STATUS_LABEL[g.status]}, prioridad ${GOAL_PRIORITY_LABEL[g.priority].toLowerCase()})`),
    hypotheses: w.hypotheses
      .filter((h) => h.status !== "discarded")
      .slice(-LIMITS.hypotheses)
      .map((h) => `[${h.id}] ${clip(h.statement, 200)} (${HYPOTHESIS_STATUS_LABEL[h.status]})`),
    experiments: w.experiments.slice(-LIMITS.experiments).map((e) => {
      const result = w.results.find((r) => r.experimentId === e.id);
      return `[${e.id}] ${clip(e.question, 160)} (${EXPERIMENT_STATUS_LABEL[e.status]}) · métrica: ${clip(e.metric, 80)} · éxito: ${clip(e.successCriterion, 100)}${result ? ` · resultado: ${OUTCOME_LABEL[result.outcome].toLowerCase()}` : ""}`;
    }),
    tasks: {
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
      open: openTasks.slice(0, LIMITS.openTasks).map(taskLine),
      blocked: tasks.filter((t) => t.status === "blocked").slice(0, LIMITS.blockedTasks).map((t) => `[${t.id}] ${clip(t.title, 120)}${t.blockedReason ? ` — ${clip(t.blockedReason, 160)}` : ""}`),
      overdue: openTasks.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today.slice(0, 10)).map(taskLine),
    },
    evidenceCount: w.evidence.length,
    permissions: Object.entries(w.permissions).filter(([, allowed]) => allowed).map(([action]) => action),
  };
}

/**
 * Síntesis pos-sesión más reciente (sale de las notas y de la transcripción de la llamada, si hubo).
 * La transcripción completa está en el conocimiento del proyecto como «Transcripción de llamada…».
 */
function lastSynthesisLine(sessions: Workspace["sessions"]): string | null {
  const s = [...sessions]
    .filter((x) => x.postSessionSynthesis)
    .sort((a, b) => b.postSessionSynthesis!.generatedAt.localeCompare(a.postSessionSynthesis!.generatedAt))[0];
  const syn = s?.postSessionSynthesis;
  if (!s || !syn) return null;
  const parts = [`[sesión ${s.id}] ${SESSION_KIND_LABEL[s.kind]} · ${day(syn.generatedAt)} — ${clip(syn.summary, 600)}`];
  if (syn.agreedDecisions.length) parts.push(`Acuerdos: ${syn.agreedDecisions.slice(0, 5).map((a) => clip(a, 140)).join("; ")}`);
  if (syn.entrepreneurCommitments.length) parts.push(`Compromisos del emprendedor: ${syn.entrepreneurCommitments.slice(0, 6).map((c) => clip(c.title, 120)).join("; ")}`);
  if (syn.mentorCommitments.length) parts.push(`Compromisos del mentor: ${syn.mentorCommitments.slice(0, 4).map((c) => clip(c.title, 120)).join("; ")}`);
  if (syn.nextSteps) parts.push(`Próximos pasos: ${clip(syn.nextSteps, 300)}`);
  return parts.join("\n    ");
}

const list = (xs: string[], empty: string) => (xs.length ? xs.map((x) => `  - ${x}`).join("\n") : `  ${empty}`);

/** Estado de un proyecto B2B: sin diagnóstico ni hipótesis (el contexto es el brief y las sesiones). */
function renderB2BProjectState(s: ProjectStateSnapshot): string {
  const turn = { client: "a la persona cliente", mentor: "al mentor", both: "al cliente o al mentor", none: "a nadie: el ciclo está cerrado" }[s.next.turn] ?? s.next.turn;
  return `<project_state flow="b2b">
Proyecto: «${s.projectName}»${s.description ? `\nDescripción: ${s.description}` : ""}
Mentor: ${s.mentors.length ? s.mentors.join(", ") : "—"}
Quien conversa: ${s.viewerIsMentor ? "el mentor del proyecto" : "una persona cliente del mentor"}
Etapa del ciclo: ${s.stage.label} — «${s.stage.question}» (Entrevista → Sesión 1 → Ciclo → Cierre)
Siguiente paso (le toca ${turn}): ${s.next.text}${s.next.page ? ` [pantalla /${s.next.page}]` : ""}
${renderJourney(s.journey, s.viewerIsMentor)}

Sesiones (número, estado y temas de la agenda):
${list(s.cycleSessions ?? [], "ninguna todavía")}
Última síntesis pos-sesión:
  ${s.sessions.lastSynthesis ?? "ninguna"}
Notas recientes visibles para quien conversa:
${list(s.sessions.recentNotes ?? [], "ninguna")}
Acuerdo de trabajo: ${s.agreement ?? "sin acuerdo todavía (se arma en la Sesión 1)"}
Objetivos del ciclo:
${list(s.goals, "sin objetivos")}
Compromisos: ${s.tasks.done}/${s.tasks.total} hechos
${list(s.tasks.open, "sin compromisos abiertos")}
Vencidos:
${list(s.tasks.overdue, "ninguno")}
Los textos entre corchetes son ids: úsalos tal cual en las herramientas.
</project_state>`;
}

/** Representación compacta para el prompt. Todo lo que está aquí es dato del proyecto, no instrucciones. */
export function renderProjectState(s: ProjectStateSnapshot): string {
  if (s.flow === "b2b") return renderB2BProjectState(s);
  const turn = { entrepreneur: "a la persona emprendedora", mentor: "al mentor", admin: "a administración (asignar mentor)", none: "a nadie: el ciclo está cerrado" }[s.next.turn] ?? s.next.turn;
  const c = s.diagnosis.counts;
  return `<project_state>
Proyecto: «${s.projectName}» (${s.nature})${s.description ? `\nDescripción: ${s.description}` : ""}
Dueño/a: ${s.owner ?? "—"} · Mentor/es: ${s.mentors.length ? s.mentors.join(", ") : "sin mentor asignado"}
Quien conversa: ${s.viewerIsMentor ? "el mentor asignado" : s.viewerRole === "entrepreneur" ? "la persona emprendedora o colaboradora" : s.viewerRole}
Etapa actual: ${s.stage.label} — «${s.stage.question}» · fase: ${s.phase.label}
Siguiente paso (le toca ${turn}): ${s.next.text} [pantalla /${s.next.page}]
${renderJourney(s.journey, s.viewerIsMentor)}

Diagnóstico vivo: ${c.total} hallazgos vigentes (${c.confirmed} confirmados, ${c.proposed} propuestos sin revisar, ${c.needsClarification} por aclarar, ${c.openQuestions} preguntas abiertas)
Resumen: ${s.diagnosis.summary ? `${s.diagnosis.summaryConfirmed ? "CONFIRMADO" : "BORRADOR sin confirmar"} — ${s.diagnosis.summary}` : "todavía no hay resumen"}
Problema priorizado: ${s.diagnosis.prioritizedProblem ?? "ninguno todavía"}
Hallazgos principales:
${list(s.diagnosis.highlights, "sin hallazgos")}
Problemas del diagnóstico:
${list(s.diagnosis.problems, "ninguno registrado")}
Hallazgos por revisar:
${list(s.diagnosis.pendingReview, "ninguno")}

Sesiones próximas:
${list(s.sessions.upcoming, "ninguna")}
Última sesión realizada: ${s.sessions.lastCompleted ?? "ninguna"}
Notas recientes de las sesiones de mentoría (las respuestas y el resto se leen con read_mentor_notes):
${list(s.sessions.recentNotes ?? [], "ninguna")}
Última síntesis pos-sesión (incluye lo hablado en la llamada si se transcribió; la transcripción completa está en el conocimiento del proyecto como «Transcripción de llamada…»):
  ${s.sessions.lastSynthesis ?? "ninguna"}
Relación de mentoría: ${s.relation ?? "todavía no se abrió (se abre sola al guardar el primer acuerdo u objetivo)"}
Acuerdo de mentoría: ${s.agreement ?? "sin acuerdo"}
Objetivos del ciclo:
${list(s.goals, "sin objetivos")}
Hipótesis:
${list(s.hypotheses, "sin hipótesis")}
Experimentos:
${list(s.experiments, "sin experimentos")}
Tareas: ${s.tasks.done}/${s.tasks.total} hechas
${list(s.tasks.open, "sin tareas abiertas")}
Bloqueadas:
${list(s.tasks.blocked, "ninguna")}
Vencidas:
${list(s.tasks.overdue, "ninguna")}
Evidencia registrada: ${s.evidenceCount}
Evaluaciones de ciclo: ${s.evaluations.length ? s.evaluations.join("; ") : "ninguna"}
Los textos entre corchetes son ids: úsalos tal cual en las herramientas.
Acciones que esta persona puede hacer en el proyecto: ${s.permissions.join(", ") || "solo lectura"}
</project_state>`;
}
