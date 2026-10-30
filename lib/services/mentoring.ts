import type {
  MentorDecision,
  MentorSession,
  MentorSessionKind,
  PostSessionSynthesis,
  PreSessionBriefing,
  SessionNote,
  SessionNoteKind,
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
} from "@/lib/ai/provider";
import { SimulatedProvider } from "@/lib/ai/simulated";
import type { FirstReviewSuggestion } from "@/lib/ai/schema";
import { createTask } from "./validation";
import { assertHypothesisTransition } from "@/features/hypotheses/rules";
import { forbidden, notFound, validation } from "@/lib/errors";
import { audit, guard, sysRepo, type ServiceDeps } from "./base";
import { touch } from "./projects";
import { dispatchEventToN8n } from "@/lib/n8n/dispatcher";

/**
 * El emprendedor solicita una revisión. La primera requiere el resumen confirmado;
 * la segunda, al menos un resultado registrado. Si no hay mentor asignado, se informa sin bloquear
 * el resto de la plataforma.
 */
export async function requestReview(d: ServiceDeps, projectId: string, kind: MentorSessionKind): Promise<MentorSession> {
  const { project } = await guard(d, projectId, "mentor.request_review");
  const [dx] = await d.repo.diagnoses.list({ projectId });
  const sessions = await d.repo.mentorSessions.list({ projectId, kind });
  if (sessions.some((s) => s.status !== "completed")) throw validation("Ya hay una revisión de este tipo en curso.");
  if (kind === "first_review" && !dx.summaryConfirmedAt) throw validation("Primero confirmá el resumen inicial para que el mentor tenga contexto fiable.");
  if (kind === "second_review") {
    const results = await d.repo.experimentResults.list({ projectId });
    if (!results.length) throw validation("La segunda revisión necesita al menos un resultado registrado.");
  }
  const [assignment] = await d.repo.mentorAssignments.list({ projectId, status: "active" });
  if (!assignment)
    throw validation("Todavía no hay un mentor asignado. Podés seguir registrando información; la administración debe asignarte uno.");
  const items = await d.repo.diagnosisItems.list({ projectId });
  const session: MentorSession = {
    id: d.newId("ses"),
    projectId,
    mentorId: assignment.mentorId,
    kind,
    status: "pending",
    briefing: buildBriefing(project, dx, items, d.now()),
    createdAt: d.now(),
  };
  await d.repo.mentorSessions.insert(session);
  await touch(d, projectId);
  return session;
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

/** Primera revisión: termina con un acuerdo explícito sobre qué investigar. */
export async function completeFirstReview(d: ServiceDeps, sessionId: string, agreement: string) {
  const s = await loadSession(d, sessionId);
  await guard(d, s.projectId, "mentor.decide");
  if (s.mentorId !== d.actor.id) throw forbidden();
  if (s.kind !== "first_review") throw validation("Esta no es una primera revisión.");
  if (s.status === "completed") throw validation("La sesión ya terminó.");
  if (agreement.trim().length < 10) throw validation("Registrá el acuerdo: qué problema investigar y qué falta saber.");
  await addNote(d, sessionId, "agreement", agreement);
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
    scheduledAt: input.scheduledAt,
    briefing: dx ? buildBriefing(project, dx, items, now) : undefined,
    createdAt: now,
  };

  await d.repo.mentorSessions.insert(session);
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
  return session;
}

export async function generatePreSessionBriefing(
  d: ServiceDeps,
  sessionId: string,
): Promise<PreSessionBriefing> {
  const s = await loadSession(d, sessionId);
  const { project, rel } = await guard(d, s.projectId, "project.read");
  const isAssigned = s.mentorId === d.actor.id || rel.isAssignedMentor;
  const isOwner = rel.isOwner || rel.isCollaborator;
  if (!isAssigned && !isOwner && d.actor.role !== "admin") {
    throw forbidden("Esta sesión está asignada a otra persona.");
  }

  const [diagnoses, allSessions, allNotes, allTasks, allExps, allRelations, diagnosisItems] = await Promise.all([
    d.repo.diagnoses.list({ projectId: s.projectId }),
    d.repo.mentorSessions.list({ projectId: s.projectId }),
    d.repo.sessionNotes.list({ projectId: s.projectId }),
    d.repo.tasks.list({ projectId: s.projectId }),
    d.repo.experiments.list({ projectId: s.projectId }),
    d.repo.mentorshipRelations.list({ projectId: s.projectId }),
    d.repo.diagnosisItems.list({ projectId: s.projectId }),
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

  // Capa 3: Temas pendientes y notas de sesiones previas
  const previousSessions = allSessions
    .filter((sess) => sess.id !== sessionId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const lastSession = previousSessions[0];
  const previousSessionNotes = lastSession
    ? allNotes.filter((n) => n.sessionId === lastSession.id && !n.isPrivate).map((n) => ({ kind: n.kind, body: n.body }))
    : [];

  let recentMessages: Array<{ author: string; content: string }> | undefined;
  if (project.shareConversationWithMentor || isOwner) {
    const [legacyMsgs, threads] = await Promise.all([
      d.repo.messages.list({ projectId: s.projectId }).catch(() => []),
      d.repo.agentThreads.list({ projectId: s.projectId }).catch(() => []),
    ]);
    const agentMsgsList: Array<{ author: string; content: string }> = [];
    if (threads.length > 0) {
      const sortedThreads = threads.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      const activeThread = sortedThreads[0];
      const msgs = await d.repo.agentMessages.list({ threadId: activeThread.id }).catch(() => []);
      for (const m of msgs.slice(-10)) {
        agentMsgsList.push({ author: m.author, content: m.content });
      }
    }
    const combined = [...legacyMsgs.map((m) => ({ author: m.author, content: m.content })), ...agentMsgsList];
    if (combined.length > 0) {
      recentMessages = combined.slice(-15);
    }
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
    previousSessionNotes,
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

  const [sessionNotes, allRelations, diagnoses, diagnosisItems] = await Promise.all([
    d.repo.sessionNotes.list({ sessionId }),
    d.repo.mentorshipRelations.list({ projectId: s.projectId }),
    d.repo.diagnoses.list({ projectId: s.projectId }),
    d.repo.diagnosisItems.list({ projectId: s.projectId }),
  ]);

  if (!project) throw notFound("Proyecto no encontrado.");
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
    sessionNotes: sessionNotes.filter((n) => !n.isPrivate).map((n) => ({ kind: n.kind, body: n.body, isPrivate: false })),
    briefingAgenda: s.preSessionBriefing?.suggestedAgenda,
    goals: allGoals.map((g) => ({ id: g.id, title: g.title })),
    keyProblems: keyProblems.length > 0 ? keyProblems : undefined,
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
  };

  await sysRepo(d).mentorSessions.update(sessionId, {
    postSessionSynthesis: synthesis,
  });

  await audit(d, "session.synthesis_generated", {
    projectId: s.projectId,
    targetId: sessionId,
    meta: { provider: res.provider },
  });
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

  await audit(d, "session.commitments_adopted", {
    projectId: s.projectId,
    targetId: sessionId,
    meta: { count: createdTasks.length },
  });
  await touch(d, s.projectId);
  return createdTasks;
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
