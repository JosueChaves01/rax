import type {
  MentorDecision,
  MentorSession,
  MentorSessionKind,
  PostSessionSynthesis,
  PreSessionBriefing,
  SessionNote,
  SessionNoteKind,
  Project,
  Task,
} from "@/types/domain";
import { buildBriefing } from "@/features/mentoring/briefing";
import { isCurrent } from "@/features/diagnosis/rules";
import { GOAL_LABEL, NATURE_LABEL } from "@/features/labels";
import {
  AiUnavailableError,
  type FirstReviewContext,
  type PostSessionSynthesisContext,
  type PostSessionSynthesisResult,
  type PreSessionBriefingContext,
  type PreSessionBriefingResult,
  type SessionNotesContext,
} from "@/lib/ai/provider";
import { SimulatedProvider } from "@/lib/ai/simulated";
import type { FirstReviewSuggestion, SessionNotesDraft } from "@/lib/ai/schema";
import { createTask } from "./validation";
import { assertHypothesisTransition } from "@/features/hypotheses/rules";
import { forbidden, notFound, validation } from "@/lib/errors";
import { audit, guard, sysRepo, type ServiceDeps } from "./base";
import { can } from "@/lib/authz";
import { touch } from "./projects";
import { dispatchEventToN8n } from "@/lib/n8n/dispatcher";
import { sessionTranscriptForAi } from "./session-transcript";
import { isFiller, plainText } from "@/lib/ai/plain-text";
import { inBackground } from "./background";
import { buildBriefingHistory } from "./briefing-history";
import { changeItem } from "./diagnosis";

/**
 * El emprendedor solicita una revisión. La primera requiere el resumen confirmado;
 * la segunda, al menos un resultado registrado. Si no hay mentor asignado, se informa sin bloquear
 * el resto de la plataforma.
 */
export async function requestReview(
  d: ServiceDeps,
  projectId: string,
  kind: MentorSessionKind,
  opts: { scheduledAt?: string } = {},
): Promise<MentorSession> {
  if (kind !== "first_review" && kind !== "second_review") throw validation("Solo se piden la primera y la segunda revisión.");
  const { project } = await guard(d, projectId, "mentor.request_review");
  const blocker = await reviewRequestBlocker(d, projectId, kind);
  if (blocker) throw validation(blocker);
  const [dx] = await d.repo.diagnoses.list({ projectId });
  const [assignment] = await d.repo.mentorAssignments.list({ projectId, status: "active" });
  const items = await d.repo.diagnosisItems.list({ projectId });
  const session: MentorSession = {
    id: d.newId("ses"),
    projectId,
    mentorId: assignment.mentorId,
    kind,
    status: "pending",
    scheduledAt: futureDate(d, opts.scheduledAt),
    briefing: buildBriefing(project, dx, items, d.now()),
    createdAt: d.now(),
  };
  await d.repo.mentorSessions.insert(session);
  await touch(d, projectId);
  // El mentor encuentra el briefing listo al abrir la revisión, sin tener que pedirlo.
  await inBackground("briefing", () => autoPrepareBriefing(d, session.id));
  return session;
}

/**
 * Por qué todavía no se puede pedir esta revisión (o null si se puede). Lo usan «Pedir revisión» y el
 * agente antes de proponer la tarjeta, para que ambos apliquen las mismas reglas.
 */
export async function reviewRequestBlocker(d: ServiceDeps, projectId: string, kind: "first_review" | "second_review"): Promise<string | null> {
  const sessions = await d.repo.mentorSessions.list({ projectId, kind });
  if (sessions.some((s) => s.status !== "completed")) return "Ya hay una revisión de este tipo en curso.";
  if (kind === "first_review") {
    const [dx] = await d.repo.diagnoses.list({ projectId });
    if (!dx?.summaryConfirmedAt) return "Primero confirmá el resumen inicial para que el mentor tenga contexto fiable.";
  } else {
    const results = await d.repo.experimentResults.list({ projectId });
    if (!results.length) return "La segunda revisión necesita al menos un resultado registrado.";
  }
  const [assignment] = await d.repo.mentorAssignments.list({ projectId, status: "active" });
  if (!assignment) return "Todavía no hay un mentor asignado. Podés seguir registrando información; la administración debe asignarte uno.";
  return null;
}

function validDate(x?: string): string | undefined {
  if (!x || Number.isNaN(Date.parse(x))) return undefined;
  return new Date(x).toISOString();
}

/** Fecha válida y por venir: no se agenda ni se confirma una sesión en el pasado. */
function futureDate(d: ServiceDeps, x?: string): string | undefined {
  const at = validDate(x);
  if (at && at <= d.now()) throw validation("La fecha de la sesión ya pasó. Elegí una fecha y hora futuras.");
  return at;
}

/**
 * El mentor de la sesión confirma la fecha pedida o, con `scheduledAt`, la cambia por otra y la deja
 * confirmada. Solo el mentor asignado a esa sesión, y solo si todavía no terminó.
 */
export async function confirmSession(d: ServiceDeps, sessionId: string, opts: { scheduledAt?: string } = {}): Promise<MentorSession> {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.note");
  if (s.mentorId !== d.actor.id) throw forbidden("Solo el mentor de esta sesión puede confirmarla.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  const requested = opts.scheduledAt ? futureDate(d, opts.scheduledAt) : undefined;
  if (opts.scheduledAt && !requested) throw validation("La fecha no es válida.");
  const at = requested ?? s.scheduledAt;
  if (!at) throw validation("La sesión no tiene fecha: indicá la fecha y hora para confirmarla.");
  if (!requested && at <= d.now()) throw validation("La fecha pedida ya pasó. Proponé una fecha y hora nuevas.");
  const rescheduled = Boolean(s.scheduledAt && requested && requested !== s.scheduledAt);
  const updated = await d.repo.mentorSessions.update(sessionId, { scheduledAt: at, confirmedAt: d.now() });
  await audit(d, "session.confirmed", { projectId: s.projectId, targetId: s.id, meta: { kind: s.kind, scheduledAt: at, rescheduled } });
  await touch(d, s.projectId);
  return updated;
}

/**
 * Una respuesta a una nota cambia lo que el mentor necesita saber: se rehace el briefing de las sesiones
 * que todavía no empezaron y ya tenían uno, para que no quede preparado con preguntas ya respondidas.
 */
export async function refreshUpcomingBriefings(d: ServiceDeps, projectId: string): Promise<void> {
  const { project } = await guard(d, projectId, "project.read");
  if (!project) return;
  const upcoming = (await d.repo.mentorSessions.list({ projectId })).filter((s) => s.status === "pending" && s.preSessionBriefing);
  for (const s of upcoming) await savePreSessionBriefing(d, s, project);
}

/** Prepara el briefing con IA al crear una sesión (lo pide quien la abre, no el mentor). */
async function autoPrepareBriefing(d: ServiceDeps, sessionId: string) {
  const s = await loadSession(d, sessionId);
  const { project } = await guard(d, s.projectId, "project.read");
  if (!project) return;
  await savePreSessionBriefing(d, s, project);
}

async function loadSession(d: ServiceDeps, sessionId: string) {
  const s = await d.repo.mentorSessions.get(sessionId);
  if (!s) throw notFound();
  return s;
}

/** El mentor abre la sesión: se regenera el resumen con el diagnóstico vigente. */
export async function startSession(d: ServiceDeps, sessionId: string) {
  const s = await loadSession(d, sessionId);
  const { project } = await guard(d, s.projectId, "mentor.note");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  const [dx] = await d.repo.diagnoses.list({ projectId: s.projectId });
  const items = await d.repo.diagnosisItems.list({ projectId: s.projectId });
  return d.repo.mentorSessions.update(sessionId, { status: "in_progress", briefing: buildBriefing(project, dx, items, d.now()) });
}

export async function addNote(d: ServiceDeps, sessionId: string, kind: SessionNoteKind, body: string, relatedItemId?: string, isPrivate?: boolean): Promise<SessionNote> {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.note");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.status === "completed") throw validation("La sesión ya terminó; abrí una nueva para agregar notas.");
  const text = body.trim();
  if (!text) throw validation("La nota está vacía.");
  if (relatedItemId) {
    const item = await d.repo.diagnosisItems.get(relatedItemId);
    if (!item || item.projectId !== s.projectId) throw notFound("El elemento no pertenece a este proyecto.");
  }
  if (s.status === "pending") await d.repo.mentorSessions.update(sessionId, { status: "in_progress", startedAt: d.now() });
  const note: SessionNote = { id: d.newId("note"), sessionId, projectId: s.projectId, authorId: d.actor.id, kind, body: text.slice(0, 2000), isPrivate: isPrivate === true, relatedItemId, createdAt: d.now() };
  await d.repo.sessionNotes.insert(note);
  await touch(d, s.projectId);
  return note;
}

export async function addNotesBatch(
  d: ServiceDeps,
  sessionId: string,
  notes: Array<{ kind: SessionNoteKind; body: string; relatedItemId?: string | null; isPrivate?: boolean }>,
): Promise<SessionNote[]> {
  const created: SessionNote[] = [];
  for (const n of notes) {
    const note = await addNote(d, sessionId, n.kind, n.body, n.relatedItemId ?? undefined, n.isPrivate);
    created.push(note);
  }
  return created;
}

/**
 * Sugerencia con IA para la primera revisión (orientar el enfoque):
 * recopila todos los datos disponibles hasta la etapa actual (proyecto, onboarding del emprendedor,
 * resumen confirmado, elementos de diagnóstico, briefing y notas existentes) y le pide al modelo
 * que redacte una propuesta de acuerdo y notas/preguntas/observaciones clave.
 */
export async function suggestFirstReview(d: ServiceDeps, sessionId: string): Promise<FirstReviewSuggestion> {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.note");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.kind !== "first_review") throw validation("Esta no es una primera revisión.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");

  const project = await d.repo.projects.get(s.projectId);
  if (!project) throw notFound("Proyecto no encontrado.");

  const [dx] = await d.repo.diagnoses.list({ projectId: s.projectId });
  const items = await d.repo.diagnosisItems.list({ projectId: s.projectId });
  const sessionNotes = await d.repo.sessionNotes.list({ sessionId });
  const existingNotes = sessionNotes.map((n) => `${n.kind}: ${n.body}`);

  const owner = await d.repo.profiles.get(project.ownerId);
  const founderOnboarding = owner?.onboarding?.intent === "entrepreneur" ? owner.onboarding : undefined;

  let recentMessages: Array<{ author: string; content: string }> | undefined;
  if (project.shareConversationWithMentor) {
    const msgs = await d.repo.messages.list({ projectId: s.projectId });
    recentMessages = msgs.slice(-10).map((m) => ({ author: m.author, content: m.content }));
  }

  const briefing = s.briefing ?? buildBriefing(project, dx, items, d.now());

  const ctx: FirstReviewContext = {
    projectName: project.name,
    projectNature: NATURE_LABEL[project.nature] ?? project.nature,
    projectSummary: dx?.summary ?? project.description,
    founderContext: founderOnboarding
      ? {
        stage: NATURE_LABEL[founderOnboarding.stage] ?? founderOnboarding.stage,
        sector: founderOnboarding.sector,
        goals: founderOnboarding.goals.map((g) => GOAL_LABEL[g] ?? g),
        mentorExpectation: founderOnboarding.mentorExpectation,
        weeklyHours: founderOnboarding.weeklyHours,
      }
      : undefined,
    briefing: {
      whatTheyBuild: briefing.whatTheyBuild,
      mainProblem: briefing.mainProblem,
      evidence: briefing.evidence,
      openAssumptions: briefing.openAssumptions,
      resourcesAndLimits: briefing.resourcesAndLimits,
      questionsForMentor: briefing.questionsForMentor,
    },
    items: items.filter(isCurrent).map((i) => ({
      id: i.id,
      category: i.category,
      title: i.title,
      content: i.content,
      infoType: i.infoType,
      reviewStatus: i.reviewStatus,
      uncertainty: i.uncertainty,
    })),
    existingNotes,
    recentMessages,
  };

  try {
    const result = await d.ai.suggestFirstReview(ctx);
    await audit(d, "ai.invoked", {
      projectId: s.projectId,
      targetId: sessionId,
      meta: { task: "first_review_suggestion", provider: result.provider },
    });
    return result.suggestion;
  } catch (e) {
    await audit(d, "ai.failed", {
      projectId: s.projectId,
      targetId: sessionId,
      meta: {
        task: "first_review_suggestion",
        reason: e instanceof AiUnavailableError ? e.reason : "unknown",
      },
    });
    throw e;
  }
}

const SESSION_STAGE: Record<MentorSession["kind"], string> = {
  exploratory: "Explorar",
  first_review: "Orientar",
  follow_up: "Ejecución",
  second_review: "Decidir",
  evaluation: "Evaluar",
};

export interface SessionNotesSuggestion {
  notes: SessionNotesDraft["notes"];
  /** De dónde salió el borrador: la transcripción de la llamada o solo el contexto del proyecto. */
  basedOn: "transcript" | "context";
}

/**
 * Borrador de notas con IA para el mentor de la sesión: a partir de la transcripción de la reunión
 * (si hubo llamada), la síntesis y el estado actual del proyecto. No guarda nada: el mentor edita
 * el borrador y lo guarda con addNotesBatch.
 */
export async function suggestSessionNotes(d: ServiceDeps, sessionId: string): Promise<SessionNotesSuggestion> {
  const s = await loadSession(d, sessionId);
  const { project } = await guard(d, s.projectId, "mentor.note");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.status === "completed") throw validation("La sesión ya terminó; abrí una nueva para agregar notas.");
  if (!project) throw notFound("Proyecto no encontrado.");

  const [[dx], items, sessionNotes, relations, callTranscript] = await Promise.all([
    d.repo.diagnoses.list({ projectId: s.projectId }),
    d.repo.diagnosisItems.list({ projectId: s.projectId }),
    d.repo.sessionNotes.list({ sessionId }),
    d.repo.mentorshipRelations.list({ projectId: s.projectId }),
    sessionTranscriptForAi(d, sessionId),
  ]);
  const relation = relations.find((r) => r.stage !== "closed") ?? relations[0];
  const goals = relation ? await d.repo.mentorshipGoals.list({ relationId: relation.id }) : [];
  const current = items.filter((i) => isCurrent(i) && i.reviewStatus !== "rejected");
  const syn = s.postSessionSynthesis;

  const ctx: SessionNotesContext = {
    projectName: project.name,
    projectSummary: dx?.summary ?? project.description,
    sessionKind: s.kind,
    stage: SESSION_STAGE[s.kind] ?? s.kind,
    items: current.slice(0, 40).map((i) => ({
      id: i.id,
      category: i.category,
      title: i.title,
      content: i.content.slice(0, 500),
      infoType: i.infoType,
      uncertainty: i.uncertainty,
      priorityRank: i.priority?.rank,
    })),
    goals: goals.map((g) => g.title),
    briefingAgenda: s.preSessionBriefing?.suggestedAgenda,
    synthesis: syn ? { summary: syn.summary, agreedDecisions: syn.agreedDecisions, nextSteps: syn.nextSteps } : undefined,
    // Las notas privadas del mentor no salen al proveedor de IA.
    existingNotes: sessionNotes.filter((n) => !n.isPrivate).map((n) => ({ kind: n.kind, body: n.body })),
    callTranscript,
  };

  try {
    const result = await d.ai.suggestSessionNotes(ctx);
    await audit(d, "ai.invoked", {
      projectId: s.projectId,
      targetId: sessionId,
      meta: { task: "session_notes", provider: result.provider, fromCall: Boolean(callTranscript) },
    });
    const validIds = new Set(current.map((i) => i.id));
    const notes = result.draft.notes
      .map((n) => ({ ...n, body: n.body.trim(), relatedItemId: n.relatedItemId && validIds.has(n.relatedItemId) ? n.relatedItemId : null }))
      .filter((n) => n.body.length > 0);
    return { notes, basedOn: callTranscript ? "transcript" : "context" };
  } catch (e) {
    await audit(d, "ai.failed", {
      projectId: s.projectId,
      targetId: sessionId,
      meta: { task: "session_notes", reason: e instanceof AiUnavailableError ? e.reason : "unknown" },
    });
    throw e;
  }
}

/** Primera revisión: termina con un acuerdo explícito sobre qué investigar. */
export async function completeFirstReview(d: ServiceDeps, sessionId: string, agreement: string) {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.decide");
  if (s.mentorId !== d.actor.id) throw forbidden();
  if (s.kind !== "first_review") throw validation("Esta no es una primera revisión.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  if (agreement.trim().length < 10) throw validation("Registrá el acuerdo: qué problema investigar y qué falta saber.");
  await addNote(d, sessionId, "agreement", agreement);
  await adoptPendingCommitments(d, s);
  await d.repo.mentorSessions.update(sessionId, { status: "completed", completedAt: d.now() });
  await audit(d, "mentor.session_completed", { projectId: s.projectId, targetId: sessionId, meta: { kind: s.kind } });
}

/**
 * Segunda revisión: decisión explícita con justificación sobre una hipótesis.
 * La decisión se atribuye a quien la tomó; nunca se simula una aprobación.
 */
export async function completeSecondReview(d: ServiceDeps, sessionId: string, decision: MentorDecision, justification: string, hypothesisId: string) {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.decide");
  if (s.mentorId !== d.actor.id) throw forbidden();
  if (s.kind !== "second_review") throw validation("Esta no es una segunda revisión.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  if (justification.trim().length < 10) throw validation("La decisión necesita una justificación.");
  const h = await d.repo.hypotheses.get(hypothesisId);
  if (!h || h.projectId !== s.projectId) throw notFound("La hipótesis no pertenece a este proyecto.");

  const nextStatus = decision === "discard" ? "discarded" : decision === "reformulate" ? "reformulated" : decision === "deepen" ? "testing" : undefined;
  if (nextStatus && nextStatus !== h.status) {
    assertHypothesisTransition(h.status, nextStatus);
    await d.repo.hypotheses.update(h.id, { status: nextStatus, updatedAt: d.now() }, h.version);
    await audit(d, "hypothesis.status_changed", { projectId: s.projectId, targetId: h.id, meta: { from: h.status, to: nextStatus, by: "mentor_decision" } });
  }
  if (decision === "pause") {
    // La decisión del mentor pausa el proyecto: el permiso ya se verificó (mentor.decide).
    await sysRepo(d).projects.update(s.projectId, { status: "paused", updatedAt: d.now() });
    await audit(d, "project.status_changed", { projectId: s.projectId, meta: { to: "paused", by: "mentor_decision" } });
  }
  await adoptPendingCommitments(d, s);
  const experiments = await d.repo.experiments.list({ projectId: s.projectId, hypothesisId });
  for (const e of experiments.filter((x) => x.status === "results_pending")) {
    await d.repo.experiments.update(e.id, { status: "reviewed", updatedAt: d.now() }, e.version);
  }
  await d.repo.mentorSessions.update(sessionId, {
    status: "completed",
    completedAt: d.now(),
    decision: { value: decision, justification: justification.trim().slice(0, 2000), hypothesisId, decidedAt: d.now() },
  });
  await audit(d, "mentor.session_completed", { projectId: s.projectId, targetId: sessionId, meta: { kind: s.kind, decision } });
  dispatchEventToN8n({
    eventId: d.newId("evt"),
    eventType: "session.completed",
    occurredAt: d.now(),
    schemaVersion: "1.0.0",
    correlationId: `ses_comp_${sessionId}`,
    actor: { id: d.actor.id, role: d.actor.role, verified: true },
    relationshipId: s.relationId,
    projectId: s.projectId,
    entityType: "session",
    entityId: sessionId,
    payload: {
      sessionKind: s.kind,
      decision,
      justification,
    },
  }).catch((err) => console.warn("[n8n-dispatch] No se pudo despachar session.completed:", err));
}


/* ── Fase 4: Ciclo de Sesiones, Briefing 4-Capas y Síntesis ── */

export async function scheduleSession(
  d: ServiceDeps,
  projectId: string,
  input: {
    kind: MentorSessionKind;
    scheduledAt?: string;
    relationId?: string;
  },
): Promise<MentorSession> {
  // Las revisiones tienen requisitos (resumen confirmado, resultados): se piden con requestReview.
  if (input.kind !== "follow_up") throw validation("Agendar es para sesiones de seguimiento. Las revisiones se piden con «Pedir revisión».");
  const { project } = await guard(d, projectId, "mentorship.manage");
  const [assignment] = await d.repo.mentorAssignments.list({ projectId, status: "active" });
  if (!assignment) {
    throw validation("El proyecto necesita un mentor asignado para agendar una sesión.");
  }

  const [dx] = await d.repo.diagnoses.list({ projectId });
  const items = await d.repo.diagnosisItems.list({ projectId });

  const now = d.now();
  const session: MentorSession = {
    id: d.newId("ses"),
    projectId,
    mentorId: assignment.mentorId,
    relationId: input.relationId,
    kind: input.kind,
    status: "pending",
    scheduledAt: futureDate(d, input.scheduledAt),
    briefing: dx ? buildBriefing(project, dx, items, now) : undefined,
    createdAt: now,
  };

  await d.repo.mentorSessions.insert(session);
  // Si la agenda el propio mentor con fecha, ya queda confirmada; si la pide el emprendedor, la confirma el mentor.
  if (session.scheduledAt && session.mentorId === d.actor.id) {
    try {
      session.confirmedAt = d.now();
      await d.repo.mentorSessions.update(session.id, { confirmedAt: session.confirmedAt });
    } catch (err) {
      session.confirmedAt = undefined;
      console.warn("[mentoring] No se pudo marcar la sesión como confirmada (¿falta la migración 20261102000003?):", err);
    }
  }
  await audit(d, "session.scheduled", {
    projectId,
    targetId: session.id,
    meta: { kind: session.kind, scheduledAt: input.scheduledAt ?? "" },
  });
  await touch(d, projectId);
  dispatchEventToN8n({
    eventId: d.newId("evt"),
    eventType: "session.scheduled",
    occurredAt: now,
    schemaVersion: "1.0.0",
    correlationId: `ses_${session.id}`,
    actor: { id: d.actor.id, role: d.actor.role, verified: true },
    relationshipId: input.relationId,
    projectId,
    entityType: "session",
    entityId: session.id,
    payload: {
      sessionKind: session.kind,
      scheduledAt: session.scheduledAt ?? "",
      mentorId: session.mentorId,
    },
  }).catch((err) => console.warn("[n8n-dispatch] No se pudo despachar session.scheduled:", err));
  await inBackground("briefing", () => autoPrepareBriefing(d, session.id));
  return session;
}

export async function generatePreSessionBriefing(
  d: ServiceDeps,
  sessionId: string,
): Promise<PreSessionBriefing> {
  const s = await loadSession(d, sessionId);
  const { project, rel } = await guard(d, s.projectId, "project.read");
  // La preparación es trabajo del mentor: solo el mentor de la sesión la genera.
  if (s.mentorId !== d.actor.id || !rel.isAssignedMentor) {
    throw forbidden("Solo el mentor de la sesión puede preparar el briefing.");
  }
  if (!project) throw notFound("Proyecto no encontrado.");
  return savePreSessionBriefing(d, s, project);
}

async function savePreSessionBriefing(d: ServiceDeps, s: MentorSession, project: Project): Promise<PreSessionBriefing> {
  const sessionId = s.id;

  const [diagnoses, allSessions, allNotes, allTasks, allExps, allRelations, diagnosisItems, allDocuments] = await Promise.all([
    d.repo.diagnoses.list({ projectId: s.projectId }),
    d.repo.mentorSessions.list({ projectId: s.projectId }),
    d.repo.sessionNotes.list({ projectId: s.projectId }),
    d.repo.tasks.list({ projectId: s.projectId }),
    d.repo.experiments.list({ projectId: s.projectId }),
    d.repo.mentorshipRelations.list({ projectId: s.projectId }),
    d.repo.diagnosisItems.list({ projectId: s.projectId }),
    d.repo.projectDocuments.list({ projectId: s.projectId }).catch(() => []),
  ]);

  if (!project) throw notFound("Proyecto no encontrado.");
  const dx = diagnoses[0];
  const activeRelation = allRelations.find((r) => r.stage !== "closed") ?? allRelations[0];
  const allGoals = activeRelation ? await d.repo.mentorshipGoals.list({ relationId: activeRelation.id }) : [];

  let agreementTerms: { scope?: string; frequency?: string; mentorCommitments?: string; entrepreneurCommitments?: string } | undefined;
  if (activeRelation) {
    const agreements = await d.repo.mentorshipAgreements.list({ relationId: activeRelation.id });
    const latestAgreement = agreements[agreements.length - 1];
    if (latestAgreement) {
      agreementTerms = {
        scope: latestAgreement.scope,
        frequency: latestAgreement.frequency,
        mentorCommitments: latestAgreement.mentorCommitments,
        entrepreneurCommitments: latestAgreement.entrepreneurCommitments,
      };
    }
  }

  // Capa 2: Progreso y ejecución reciente
  const recentCompletedTasks = allTasks
    .filter((t) => t.status === "done")
    .slice(-10)
    .map((t) => ({ title: t.title, actionType: t.actionType }));

  const blockedOrDelayedTasks = allTasks
    .filter((t) => t.status === "blocked" || t.delayHypothesis)
    .slice(-10)
    .map((t) => ({
      title: t.title,
      blockedReason: t.blockedReason,
      delayCause: t.delayHypothesis?.causeCategory,
      delayDetail: t.delayHypothesis?.detail,
    }));

  const experimentsInProgress = allExps
    .filter((e) => e.status === "running" || e.status === "results_pending")
    .map((e) => ({ question: e.question, status: e.status, metric: e.metric }));

  // Extraer contexto del diagnóstico de Etapa 1
  const validItems = diagnosisItems.filter((i) => i.reviewStatus !== "rejected");
  const diagnosisProblems = validItems
    .filter((i) => i.category === "problem")
    .map((i) => ({ id: i.id, title: i.title, content: i.content, isPrioritized: !!i.priority }));
  const diagnosisHypotheses = validItems
    .filter((i) => i.infoType === "hypothesis")
    .map((i) => ({ id: i.id, title: i.title, content: i.content }));
  const diagnosisEvidence = validItems
    .filter((i) => i.infoType === "verifiable_evidence" || i.infoType === "documented_observation")
    .map((i) => ({ id: i.id, title: i.title, content: i.content }));
  const diagnosisUnknowns = validItems
    .filter((i) => i.infoType === "unknown" || i.category === "open_question")
    .map((i) => ({ id: i.id, title: i.title, content: i.content }));

  // Capa 3: todo lo que dejaron las sesiones previas (notas con sus respuestas, preguntas respondidas o no,
  // síntesis, decisiones, compromisos y transcripción) más los documentos del proyecto.
  const history = await buildBriefingHistory(d, s, allSessions, allNotes, allDocuments);

  // Solo lo que planteó la persona (no las respuestas del asistente), en texto plano y sin muletillas.
  let recentMessages: Array<{ author: string; content: string }> | undefined;
  if (project.shareConversationWithMentor) {
    const [legacyMsgs, threads] = await Promise.all([
      d.repo.messages.list({ projectId: s.projectId }).catch(() => []),
      d.repo.agentThreads.list({ projectId: s.projectId }).catch(() => []),
    ]);
    const fromPerson: Array<{ at: string; content: string }> = legacyMsgs
      .filter((m) => m.author === "entrepreneur")
      .map((m) => ({ at: m.createdAt, content: m.content }));
    const recentThreads = [...threads].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3);
    for (const t of recentThreads) {
      const msgs = await d.repo.agentMessages.list({ threadId: t.id }).catch(() => []);
      for (const m of msgs) if (m.author === "user") fromPerson.push({ at: m.createdAt, content: m.content });
    }
    const topics = fromPerson
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((m) => plainText(m.content, 220))
      .filter((t) => t && !isFiller(t));
    const unique = [...new Set(topics)].slice(-8);
    if (unique.length > 0) recentMessages = unique.map((content) => ({ author: "emprendedor", content }));
  }

  const ctx: PreSessionBriefingContext = {
    projectName: project.name,
    projectNature: NATURE_LABEL[project.nature] ?? project.nature,
    projectSummary: dx?.summary ?? project.description,
    sessionKind: s.kind,
    agreement: agreementTerms,
    goals: allGoals.map((g) => ({
      id: g.id,
      title: g.title,
      baseline: g.baseline,
      targetResult: g.targetResult,
      status: g.status,
      priority: g.priority,
    })),
    recentCompletedTasks,
    blockedOrDelayedTasks,
    experimentsInProgress,
    diagnosisProblems: diagnosisProblems.length > 0 ? diagnosisProblems : undefined,
    diagnosisHypotheses: diagnosisHypotheses.length > 0 ? diagnosisHypotheses : undefined,
    diagnosisEvidence: diagnosisEvidence.length > 0 ? diagnosisEvidence : undefined,
    diagnosisUnknowns: diagnosisUnknowns.length > 0 ? diagnosisUnknowns : undefined,
    ...history,
    recentMessages,
  };

  let res: PreSessionBriefingResult;
  try {
    res = await d.ai.generatePreSessionBriefing(ctx);
  } catch (err) {
    console.warn("[mentoring] AI provider unavailable for briefing, falling back to simulated generator:", err);
    const fallbackProvider = new SimulatedProvider();
    res = await fallbackProvider.generatePreSessionBriefing(ctx);
  }

  const briefing: PreSessionBriefing = {
    generatedAt: d.now(),
    ...res.briefing,
  };

  await sysRepo(d).mentorSessions.update(sessionId, {
    preSessionBriefing: briefing,
  });

  await audit(d, "session.briefing_generated", {
    projectId: s.projectId,
    targetId: sessionId,
    meta: { provider: res.provider },
  });
  await touch(d, s.projectId);
  dispatchEventToN8n({
    eventId: d.newId("evt"),
    eventType: "session.prep_requested",
    occurredAt: d.now(),
    schemaVersion: "1.0.0",
    correlationId: `briefing_${sessionId}`,
    actor: { id: d.actor.id, role: d.actor.role, verified: true },
    relationshipId: s.relationId,
    projectId: s.projectId,
    entityType: "session",
    entityId: sessionId,
    payload: {
      sessionKind: s.kind,
      agendaTopics: briefing.suggestedAgenda || [],
      suggestedQuestions: briefing.suggestedQuestions || [],
      goals: allGoals.map((g) => g.title),
    },
  }).catch((err) => console.warn("[n8n-dispatch] No se pudo despachar session.prep_requested:", err));
  return briefing;
}

export async function generatePostSessionSynthesis(
  d: ServiceDeps,
  sessionId: string,
): Promise<PostSessionSynthesis> {
  const s = await loadSession(d, sessionId);
  const { project, rel } = await guard(d, s.projectId, "project.read");
  const isAssigned = s.mentorId === d.actor.id || rel.isAssignedMentor;
  const isOwner = rel.isOwner || rel.isCollaborator;
  if (!isAssigned && !isOwner && d.actor.role !== "admin") {
    throw forbidden("Esta sesión está asignada a otra persona.");
  }

  const [sessionNotes, allRelations, diagnoses, diagnosisItems, callTranscript] = await Promise.all([
    d.repo.sessionNotes.list({ sessionId }),
    d.repo.mentorshipRelations.list({ projectId: s.projectId }),
    d.repo.diagnoses.list({ projectId: s.projectId }),
    d.repo.diagnosisItems.list({ projectId: s.projectId }),
    sessionTranscriptForAi(d, sessionId),
  ]);

  if (!project) throw notFound("Proyecto no encontrado.");
  const sharedNotes = sessionNotes.filter((n) => !n.isPrivate);
  // La síntesis sale de la transcripción de la llamada; sin llamada, de las notas compartidas.
  if (!callTranscript && sharedNotes.length === 0) {
    throw validation("Todavía no hay transcripción de la llamada ni notas compartidas para sintetizar. Haz la llamada desde la sesión o escribe la síntesis a mano.");
  }
  const dx = diagnoses[0];
  const activeRelation = allRelations.find((r) => r.stage !== "closed") ?? allRelations[0];
  const allGoals = activeRelation ? await d.repo.mentorshipGoals.list({ relationId: activeRelation.id }) : [];
  const validItems = diagnosisItems.filter((i) => i.reviewStatus !== "rejected");
  const keyProblems = validItems
    .filter((i) => i.category === "problem")
    .map((i) => ({ id: i.id, title: i.title }));

  const ctx: PostSessionSynthesisContext = {
    projectName: project.name,
    projectSummary: dx?.summary ?? project.description,
    sessionKind: s.kind,
    // El resumen se persiste en la sesión, visible para el emprendedor; notas privadas no entran al proveedor.
    sessionNotes: sharedNotes.map((n) => ({ kind: n.kind, body: n.body, isPrivate: false })),
    briefingAgenda: s.preSessionBriefing?.suggestedAgenda,
    goals: allGoals.map((g) => ({ id: g.id, title: g.title })),
    keyProblems: keyProblems.length > 0 ? keyProblems : undefined,
    callTranscript,
  };

  let res: PostSessionSynthesisResult;
  try {
    res = await d.ai.generatePostSessionSynthesis(ctx);
  } catch (err) {
    console.warn("[mentoring] AI provider unavailable for synthesis, falling back to simulated generator:", err);
    const fallbackProvider = new SimulatedProvider();
    res = await fallbackProvider.generatePostSessionSynthesis(ctx);
  }

  const synthesis: PostSessionSynthesis = {
    generatedAt: d.now(),
    ...res.synthesis,
    basedOn: callTranscript ? "transcript" : "notes",
    // Si los compromisos ya se volvieron tareas, regenerar la síntesis no los vuelve a crear.
    commitmentsAdoptedAt: s.postSessionSynthesis?.commitmentsAdoptedAt,
  };

  await sysRepo(d).mentorSessions.update(sessionId, {
    postSessionSynthesis: synthesis,
  });

  await audit(d, "session.synthesis_generated", {
    projectId: s.projectId,
    targetId: sessionId,
    meta: { provider: res.provider, fromCall: Boolean(callTranscript) },
  });
  await touch(d, s.projectId);
  return synthesis;
}

export interface PostSessionSynthesisInput {
  summary: string;
  agreedDecisions: string[];
  entrepreneurCommitments: Array<{ title: string; actionType?: PostSessionSynthesis["entrepreneurCommitments"][number]["actionType"]; dueDate?: string }>;
  mentorCommitments: Array<{ title: string; dueDate?: string }>;
  nextSteps?: string;
  suggestedNextSessionInDays?: number;
}

/**
 * El mentor de la sesión o el equipo del proyecto corrige o completa la síntesis (o la escribe a
 * mano si no se generó). Los compromisos ya adoptados como tareas no cambian.
 */
export async function updatePostSessionSynthesis(
  d: ServiceDeps,
  sessionId: string,
  input: PostSessionSynthesisInput,
): Promise<PostSessionSynthesis> {
  const s = await loadSession(d, sessionId);
  const { rel } = await guard(d, s.projectId, "project.read");
  const isSessionMentor = s.mentorId === d.actor.id && rel.isAssignedMentor;
  if (!isSessionMentor && !rel.isOwner && !rel.isCollaborator) {
    throw forbidden("Solo el mentor de la sesión y el equipo del proyecto pueden editar la síntesis.");
  }
  const clean = (x: string) => x.replace(/\s+$/g, "").trim();
  const summary = clean(input.summary);
  if (summary.length < 3) throw validation("La síntesis necesita un resumen.");
  const list = (xs: string[], max: number) => xs.map(clean).filter(Boolean).slice(0, max).map((x) => x.slice(0, 400));
  const days = input.suggestedNextSessionInDays;
  const now = d.now();
  const prev = s.postSessionSynthesis;
  const synthesis: PostSessionSynthesis = {
    generatedAt: prev?.generatedAt ?? now,
    basedOn: prev?.basedOn ?? "manual",
    summary: summary.slice(0, 3000),
    agreedDecisions: list(input.agreedDecisions, 15),
    entrepreneurCommitments: input.entrepreneurCommitments
      .map((c) => ({ ...c, title: clean(c.title).slice(0, 200) }))
      .filter((c) => c.title)
      .slice(0, 15),
    mentorCommitments: input.mentorCommitments
      .map((c) => ({ ...c, title: clean(c.title).slice(0, 200) }))
      .filter((c) => c.title)
      .slice(0, 15),
    nextSteps: input.nextSteps?.trim() ? input.nextSteps.trim().slice(0, 1000) : undefined,
    suggestedNextSessionInDays: days && Number.isInteger(days) && days >= 1 && days <= 90 ? days : undefined,
    editedAt: now,
    editedBy: d.actor.id,
    commitmentsAdoptedAt: prev?.commitmentsAdoptedAt,
  };
  await sysRepo(d).mentorSessions.update(sessionId, { postSessionSynthesis: synthesis });
  await audit(d, "session.synthesis_edited", { projectId: s.projectId, targetId: sessionId });
  await touch(d, s.projectId);
  return synthesis;
}

export async function adoptPostSessionCommitments(
  d: ServiceDeps,
  sessionId: string,
  selectedIndices?: number[],
): Promise<Task[]> {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "task.manage");
  if (!s.postSessionSynthesis?.entrepreneurCommitments?.length) {
    throw validation("La sesión no tiene compromisos generados para adoptar.");
  }
  if (s.postSessionSynthesis.commitmentsAdoptedAt) throw validation("Los compromisos de esta sesión ya son tareas.");

  const allCommitments = s.postSessionSynthesis.entrepreneurCommitments;
  const toAdopt = selectedIndices && selectedIndices.length
    ? allCommitments.filter((_, idx) => selectedIndices.includes(idx))
    : allCommitments;

  const createdTasks: Task[] = [];
  for (const c of toAdopt) {
    const task = await createTask(d, s.projectId, {
      title: c.title,
      actionType: c.actionType,
      dueDate: c.dueDate,
      goalId: c.goalId,
    });
    createdTasks.push(task);
  }

  await sysRepo(d).mentorSessions.update(sessionId, {
    postSessionSynthesis: { ...s.postSessionSynthesis, commitmentsAdoptedAt: d.now() },
  });
  await audit(d, "session.commitments_adopted", {
    projectId: s.projectId,
    targetId: sessionId,
    meta: { count: createdTasks.length },
  });
  await touch(d, s.projectId);
  return createdTasks;
}

/** Al cerrar una sesión, los compromisos del emprendedor de la síntesis pasan a ser tareas (una sola vez). */
async function adoptPendingCommitments(d: ServiceDeps, s: MentorSession) {
  const syn = s.postSessionSynthesis;
  if (!syn?.entrepreneurCommitments?.length || syn.commitmentsAdoptedAt) return;
  await adoptPostSessionCommitments(d, s.id);
}

export async function completeSession(
  d: ServiceDeps,
  sessionId: string,
  summary?: string,
): Promise<MentorSession> {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.decide");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.status === "completed") throw validation("La sesión ya fue completada.");

  const now = d.now();
  if (summary && summary.trim()) {
    await addNote(d, sessionId, "agreement", summary.trim());
  }
  await adoptPendingCommitments(d, s);

  const updated = await d.repo.mentorSessions.update(sessionId, {
    status: "completed",
    completedAt: now,
  });

  await audit(d, "session.completed", {
    projectId: s.projectId,
    targetId: sessionId,
    meta: { kind: s.kind },
  });
  await touch(d, s.projectId);
  return updated;
}

/**
 * Lo que muestra una sesión de mentoría en sus pestañas (Notas, Documentos, Tareas), con los
 * permisos de quien mira. Las notas privadas de otra persona no se devuelven.
 */
export async function getMentorSessionWorkspace(d: ServiceDeps, sessionId: string) {
  const s = await loadSession(d, sessionId);
  const { rel } = await guard(d, s.projectId, "project.read");
  const [notes, tasks, docs, evidence] = await Promise.all([
    d.repo.sessionNotes.list({ sessionId }),
    d.repo.tasks.list({ projectId: s.projectId }),
    d.repo.projectDocuments.list({ projectId: s.projectId }),
    d.repo.evidence.list({ projectId: s.projectId }),
  ]);
  const people = new Map<string, string>();
  for (const id of new Set([...notes.map((n) => n.authorId), ...tasks.map((t) => t.assigneeId)])) {
    const p = await d.repo.profiles.get(id).catch(() => undefined);
    if (p) people.set(id, p.name);
  }
  return {
    session: s,
    notes: notes
      .filter((n) => !n.isPrivate || n.authorId === d.actor.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((n) => ({ ...n, authorName: people.get(n.authorId) ?? "Otra persona" })),
    tasks: tasks
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((t) => ({ ...t, assigneeName: people.get(t.assigneeId) ?? "Sin asignar" })),
    documents: docs
      .filter((doc) => doc.content !== "")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ content, ...doc }) => ({ ...doc, preview: content.slice(0, 600) })),
    evidence: evidence.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    permissions: {
      canNote: s.mentorId === d.actor.id && s.status !== "completed" && can(d.actor, "mentor.note", rel),
      canManageTasks: can(d.actor, "task.manage", rel),
      canAddDocuments: rel.isOwner || rel.isCollaborator,
    },
  };
}

export interface CloseSessionInput {
  /** Primera revisión: qué investigar y qué falta saber. */
  agreement?: string;
  /** Primera revisión: el problema que se investiga primero y por qué. */
  priority?: { itemId: string; rationale: string };
  /** Segunda revisión: decisión formal sobre una hipótesis. */
  decision?: { value: MentorDecision; hypothesisId: string; justification: string };
  /** Seguimiento: acuerdos finales (opcional). */
  summary?: string;
}

/**
 * Cierre único de una sesión, desde el borrador que el mentor revisa al terminar: registra el acuerdo
 * (y la prioridad) o la decisión, convierte los compromisos en tareas y cierra la sesión.
 * Todo se valida antes de escribir nada.
 */
export async function closeSession(d: ServiceDeps, sessionId: string, input: CloseSessionInput): Promise<MentorSession> {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.decide");
  if (s.mentorId !== d.actor.id) throw forbidden("Esta sesión está asignada a otra persona.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");

  if (s.kind === "first_review") {
    const agreement = (input.agreement ?? "").trim();
    if (agreement.length < 10) throw validation("Registrá el acuerdo: qué problema investigar y qué falta saber.");
    const items = await d.repo.diagnosisItems.list({ projectId: s.projectId });
    const problems = items.filter((i) => isCurrent(i) && i.category === "problem" && i.reviewStatus !== "rejected" && i.infoType !== "unknown");
    const alreadyPrioritized = problems.some((i) => i.priority);
    let toPrioritize: { item: (typeof problems)[number]; rationale: string } | undefined;
    if (input.priority?.itemId) {
      const item = problems.find((i) => i.id === input.priority!.itemId);
      if (!item) throw notFound("Ese problema no pertenece al diagnóstico de este proyecto.");
      const rationale = input.priority.rationale.trim();
      if (!rationale) throw validation("Explicá por qué ese problema va primero.");
      if (item.priority?.rank !== 1 || item.priority.rationale !== rationale) toPrioritize = { item, rationale };
    } else if (problems.length > 0 && !alreadyPrioritized) {
      throw validation("Elegí el problema a investigar primero.");
    }
    if (toPrioritize) {
      await changeItem(d, toPrioritize.item.id, { kind: "prioritize", rank: 1, rationale: toPrioritize.rationale.slice(0, 2000) }, toPrioritize.item.version);
    }
    await completeFirstReview(d, sessionId, agreement);
  } else if (s.kind === "second_review") {
    if (!input.decision) throw validation("Elegí la decisión y la hipótesis sobre la que se toma.");
    await completeSecondReview(d, sessionId, input.decision.value, input.decision.justification, input.decision.hypothesisId);
  } else {
    await completeSession(d, sessionId, input.summary);
  }
  return loadSession(d, sessionId);
}
