import type { ActionType, Evidence, EvidenceKind, Experiment, ExperimentResult, Hypothesis, ResultOutcome, Task, TaskStatus, Uncertainty } from "@/types/domain";
import { assertHypothesisTransition, assertTestable, OUTCOME_TO_HYPOTHESIS } from "@/features/hypotheses/rules";
import { assertCriteriaEditable, assertExperimentTransition, assertReady } from "@/features/experiments/rules";
import { notFound, validation } from "@/lib/errors";
import { audit, guard, type ServiceDeps } from "./base";
import { touch } from "./projects";
import { isCurrent } from "@/features/diagnosis/rules";
import { GOAL_LABEL, NATURE_LABEL } from "@/features/labels";
import { AiUnavailableError, type ExperimentSuggestionContext, type ExperimentTasksContext, type HypothesisSuggestionContext } from "@/lib/ai/provider";
import type { ExperimentTasksSuggestion, HypothesesSuggestion, SuggestedExperiment } from "@/lib/ai/schema";

/* ───────────── Hipótesis ───────────── */

export type HypothesisInput = Pick<
  Hypothesis,
  "statement" | "segment" | "whyItMatters" | "currentEvidence" | "costOfBeingWrong" | "evaluationCriterion"
> & { uncertainty: Uncertainty; relatedItemId?: string };

const clean = (h: HypothesisInput): HypothesisInput => ({
  ...h,
  statement: h.statement.trim().slice(0, 600),
  segment: h.segment.trim().slice(0, 200),
  whyItMatters: h.whyItMatters.trim().slice(0, 600),
  currentEvidence: h.currentEvidence.trim().slice(0, 600),
  costOfBeingWrong: h.costOfBeingWrong.trim().slice(0, 600),
  evaluationCriterion: h.evaluationCriterion.trim().slice(0, 600),
});

export async function proposeHypothesis(d: ServiceDeps, projectId: string, input: HypothesisInput): Promise<Hypothesis> {
  await guard(d, projectId, "hypothesis.propose");
  const h = clean(input);
  if (!h.statement) throw validation("Escribí la afirmación que querés comprobar.");
  if (h.relatedItemId) {
    const item = await d.repo.diagnosisItems.get(h.relatedItemId);
    if (!item || item.projectId !== projectId) throw notFound("El elemento relacionado no pertenece a este proyecto.");
  }
  const now = d.now();
  const row: Hypothesis = { id: d.newId("hyp"), projectId, ...h, status: "draft", proposedBy: d.actor.id, version: 1, createdAt: now, updatedAt: now };
  await d.repo.hypotheses.insert(row);
  await touch(d, projectId);
  return row;
}

export async function updateHypothesis(d: ServiceDeps, id: string, input: HypothesisInput, expectedVersion: number) {
  const h = await d.repo.hypotheses.get(id);
  if (!h) throw notFound();
  await guard(d, h.projectId, "hypothesis.propose");
  if (h.status !== "draft" && h.status !== "pending_approval") throw validation("Solo se editan hipótesis en borrador o pendientes. Para cambiar una aprobada, reformulala.");
  return d.repo.hypotheses.update(id, { ...clean(input), status: "draft", updatedAt: d.now() }, expectedVersion);
}

async function transition(d: ServiceDeps, id: string, to: Hypothesis["status"], action: "hypothesis.propose" | "hypothesis.approve", extra: Partial<Hypothesis> = {}) {
  const h = await d.repo.hypotheses.get(id);
  if (!h) throw notFound();
  await guard(d, h.projectId, action);
  assertHypothesisTransition(h.status, to);
  const next = await d.repo.hypotheses.update(id, { status: to, updatedAt: d.now(), ...extra }, h.version);
  await audit(d, "hypothesis.status_changed", { projectId: h.projectId, targetId: id, meta: { from: h.status, to } });
  await touch(d, h.projectId);
  return next;
}

export async function submitHypothesis(d: ServiceDeps, id: string) {
  const h = await d.repo.hypotheses.get(id);
  if (!h) throw notFound();
  assertTestable(h);
  return transition(d, id, "pending_approval", "hypothesis.propose");
}

/** Aprobar requiere criterio humano del mentor asignado: nadie más puede hacerlo ni simularlo. */
export const approveHypothesis = (d: ServiceDeps, id: string) => transition(d, id, "approved", "hypothesis.approve", { approvedBy: d.actor.id });
export const returnHypothesis = (d: ServiceDeps, id: string) => transition(d, id, "draft", "hypothesis.approve");
export const discardHypothesis = (d: ServiceDeps, id: string) => transition(d, id, "discarded", "hypothesis.propose");

/** Reformular conserva la hipótesis original (estado «reformulada») y crea una nueva en borrador enlazada. */
export async function reformulateHypothesis(d: ServiceDeps, id: string, input: HypothesisInput) {
  const old = await d.repo.hypotheses.get(id);
  if (!old) throw notFound();
  await guard(d, old.projectId, "hypothesis.propose");
  if (old.status !== "reformulated") assertHypothesisTransition(old.status, "reformulated");
  const fresh = await proposeHypothesis(d, old.projectId, { ...input, relatedItemId: input.relatedItemId ?? old.relatedItemId });
  const latest = (await d.repo.hypotheses.get(id))!;
  await d.repo.hypotheses.update(id, { status: "reformulated", supersededBy: fresh.id, updatedAt: d.now() }, latest.version);
  await audit(d, "hypothesis.status_changed", { projectId: old.projectId, targetId: id, meta: { from: old.status, to: "reformulated" } });
  return fresh;
}

/** Sugerencia de hipótesis basada en el contexto global acumulado del proyecto */
export async function suggestHypotheses(d: ServiceDeps, projectId: string): Promise<HypothesesSuggestion> {
  await guard(d, projectId, "hypothesis.propose");
  const r = d.repo;
  const where = { projectId };
  const [project, diagnoses, items, sessions, notes, hypotheses] = await Promise.all([
    r.projects.get(projectId),
    r.diagnoses.list(where),
    r.diagnosisItems.list(where),
    r.mentorSessions.list(where),
    r.sessionNotes.list(where),
    r.hypotheses.list(where),
  ]);
  if (!project) throw notFound("El proyecto no existe.");
  const diagnosis = diagnoses[0];
  const ownerProfile = await r.profiles.get(project.ownerId);

  const currentItems = items.filter(isCurrent);
  const prioritizedProblems = currentItems
    .filter((i) => i.category === "problem" && i.priority && i.reviewStatus !== "rejected")
    .sort((a, b) => (a.priority?.rank ?? 99) - (b.priority?.rank ?? 99))
    .map((i) => ({ id: i.id, title: i.title, content: i.content, rank: i.priority?.rank, justification: i.priority?.rationale }));

  const otherProblems = currentItems
    .filter((i) => i.category === "problem" && !i.priority && i.reviewStatus !== "rejected")
    .map((i) => ({ id: i.id, title: i.title, content: i.content }));

  const keyAssumptions = currentItems
    .filter((i) => (i.infoType === "hypothesis" || i.uncertainty === "high" || i.category === "risk") && i.reviewStatus !== "rejected")
    .map((i) => ({ id: i.id, title: i.title, content: i.content, uncertainty: i.uncertainty }));

  const openQuestions = currentItems
    .filter((i) => (i.category === "open_question" || i.infoType === "unknown") && i.reviewStatus !== "rejected")
    .map((i) => ({ id: i.id, title: i.title, content: i.content }));

  const firstSession = sessions.find((s) => s.kind === "first_review" && s.status === "completed");
  const firstSessionNotes = firstSession ? notes.filter((n) => n.sessionId === firstSession.id) : [];
  const mentorAgreement = firstSessionNotes.find((n) => n.kind === "agreement")?.body;

  const existingHypotheses = hypotheses.map((h) => ({
    id: h.id,
    statement: h.statement,
    segment: h.segment,
    status: h.status,
  }));

  const founderOnboarding = ownerProfile?.onboarding?.intent === "entrepreneur" ? ownerProfile.onboarding : undefined;

  const ctx: HypothesisSuggestionContext = {
    projectName: project.name,
    projectNature: NATURE_LABEL[project.nature] ?? project.nature,
    projectSummary: diagnosis?.summary ?? project.description,
    founderContext: founderOnboarding
      ? {
        stage: NATURE_LABEL[founderOnboarding.stage] ?? founderOnboarding.stage,
        sector: founderOnboarding.sector,
        goals: founderOnboarding.goals.map((g) => GOAL_LABEL[g] ?? g),
      }
      : undefined,
    prioritizedProblems,
    otherProblems,
    keyAssumptions,
    openQuestions,
    mentorAgreement,
    mentorNotes: firstSessionNotes.map((n) => `[${n.kind}] ${n.body}`),
    existingHypotheses,
  };

  try {
    const result = await d.ai.suggestHypotheses(ctx);
    await audit(d, "ai.invoked", {
      projectId,
      meta: { task: "hypothesis_suggestion", provider: result.provider },
    });
    return result.suggestion;
  } catch (e) {
    await audit(d, "ai.failed", {
      projectId,
      meta: {
        task: "hypothesis_suggestion",
        reason: e instanceof AiUnavailableError ? e.reason : "unknown",
      },
    });
    throw e;
  }
}

/* ───────────── Experimentos ───────────── */

export type ExperimentInput = Omit<
  Experiment,
  "id" | "projectId" | "hypothesisId" | "status" | "criteriaLockedAt" | "version" | "createdAt" | "updatedAt" | "ownerId"
> & { ownerId?: string };

const cleanExp = (e: ExperimentInput): ExperimentInput => ({
  ...e,
  question: e.question.trim(),
  method: e.method.trim(),
  participants: e.participants.trim(),
  activities: e.activities.map((a) => a.trim()).filter(Boolean).slice(0, 20),
  resources: e.resources.trim(),
  budget: e.budget === null || Number.isNaN(e.budget) ? null : Math.max(0, e.budget),
  durationDays: e.durationDays === null || Number.isNaN(e.durationDays) ? null : Math.max(1, Math.round(e.durationDays)),
  metric: e.metric.trim(),
  successCriterion: e.successCriterion.trim(),
  rejectionCriterion: e.rejectionCriterion.trim(),
  risks: e.risks.trim(),
  evidencePlan: e.evidencePlan.trim(),
});

export async function createExperiment(d: ServiceDeps, hypothesisId: string, input: ExperimentInput): Promise<Experiment> {
  const h = await d.repo.hypotheses.get(hypothesisId);
  if (!h) throw notFound();
  await guard(d, h.projectId, "experiment.design");
  if (!["approved", "testing", "inconclusive", "supported", "weakened"].includes(h.status))
    throw validation("Diseñá experimentos sobre hipótesis aprobadas por el mentor.");
  const e = cleanExp(input);
  if (!e.question) throw validation("¿Qué pregunta intenta responder el experimento?");
  const now = d.now();
  const row: Experiment = {
    id: d.newId("exp"),
    projectId: h.projectId,
    hypothesisId,
    ...e,
    ownerId: e.ownerId ?? d.actor.id,
    status: "design",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await d.repo.experiments.insert(row);
  await touch(d, h.projectId);
  return row;
}

export async function updateExperiment(d: ServiceDeps, id: string, input: Partial<ExperimentInput>, expectedVersion: number) {
  const e = await d.repo.experiments.get(id);
  if (!e) throw notFound();
  await guard(d, e.projectId, "experiment.design");
  if (e.status !== "design" && e.status !== "ready") throw validation("El experimento ya empezó: su diseño no se modifica.");
  assertCriteriaEditable(e, input);
  const merged = cleanExp({ ...e, ...input } as ExperimentInput);
  return d.repo.experiments.update(id, { ...merged, status: "design", updatedAt: d.now() }, expectedVersion);
}

async function moveExperiment(d: ServiceDeps, id: string, to: Experiment["status"], action: "experiment.design" | "experiment.start", extra: Partial<Experiment> = {}) {
  const e = await d.repo.experiments.get(id);
  if (!e) throw notFound();
  await guard(d, e.projectId, action);
  assertExperimentTransition(e.status, to);
  if (to === "ready") assertReady(e);
  const next = await d.repo.experiments.update(id, { status: to, updatedAt: d.now(), ...extra }, e.version);
  await audit(d, "experiment.status_changed", { projectId: e.projectId, targetId: id, meta: { from: e.status, to } });
  await touch(d, e.projectId);
  return next;
}

export const markExperimentReady = (d: ServiceDeps, id: string) => moveExperiment(d, id, "ready", "experiment.design");

/** Iniciar bloquea los criterios (definidos antes de ver resultados) y pone la hipótesis en prueba. */
export async function startExperiment(d: ServiceDeps, id: string) {
  const e = await moveExperiment(d, id, "running", "experiment.start", { criteriaLockedAt: d.now() });
  const h = (await d.repo.hypotheses.get(e.hypothesisId))!;
  if (h.status !== "testing") {
    assertHypothesisTransition(h.status, "testing");
    await d.repo.hypotheses.update(h.id, { status: "testing", updatedAt: d.now() }, h.version);
    await audit(d, "hypothesis.status_changed", { projectId: h.projectId, targetId: h.id, meta: { from: h.status, to: "testing" } });
  }
  return e;
}

export async function recordResult(
  d: ServiceDeps,
  experimentId: string,
  input: { outcome: ResultOutcome; observed: string; metricValue: string; learnings: string; limitations: string; evidenceIds: string[] },
): Promise<ExperimentResult> {
  const e = await d.repo.experiments.get(experimentId);
  if (!e) throw notFound();
  await guard(d, e.projectId, "experiment.record_result");
  if (e.status !== "running") throw validation("Solo se registran resultados de experimentos en ejecución.");
  if (!input.observed.trim()) throw validation("Describí qué se observó, aunque no sea lo esperado.");
  for (const evId of input.evidenceIds) {
    const ev = await d.repo.evidence.get(evId);
    if (!ev || ev.projectId !== e.projectId) throw notFound("Una de las evidencias no pertenece a este proyecto.");
  }
  const result: ExperimentResult = {
    id: d.newId("res"),
    experimentId,
    projectId: e.projectId,
    outcome: input.outcome,
    observed: input.observed.trim().slice(0, 2000),
    metricValue: input.metricValue.trim().slice(0, 200),
    learnings: input.learnings.trim().slice(0, 2000),
    limitations: input.limitations.trim().slice(0, 2000),
    evidenceIds: input.evidenceIds,
    recordedBy: d.actor.id,
    createdAt: d.now(),
  };
  await d.repo.experimentResults.insert(result);
  await moveExperiment(d, experimentId, "results_pending", "experiment.design");
  // El resultado actualiza la hipótesis sin borrar nada: respaldada, debilitada o inconclusa.
  const h = (await d.repo.hypotheses.get(e.hypothesisId))!;
  const to = OUTCOME_TO_HYPOTHESIS[input.outcome];
  if (h.status === "testing") {
    await d.repo.hypotheses.update(h.id, { status: to, updatedAt: d.now() }, h.version);
    await audit(d, "hypothesis.status_changed", { projectId: h.projectId, targetId: h.id, meta: { from: h.status, to, by: "result" } });
  }
  await audit(d, "experiment.result_recorded", { projectId: e.projectId, targetId: experimentId, meta: { outcome: input.outcome } });
  return result;
}

/** Sugiere el diseño de un experimento con IA para una hipótesis testeable */
export async function suggestExperiment(d: ServiceDeps, projectId: string, hypothesisId: string): Promise<SuggestedExperiment> {
  await guard(d, projectId, "experiment.design");
  const h = await d.repo.hypotheses.get(hypothesisId);
  if (!h || h.projectId !== projectId) throw notFound("La hipótesis no pertenece a este proyecto.");
  if (!["approved", "testing", "inconclusive", "supported", "weakened"].includes(h.status)) {
    throw validation("Diseñá experimentos sobre hipótesis aprobadas por el mentor.");
  }

  const [project, items, experiments] = await Promise.all([
    d.repo.projects.get(projectId),
    h.relatedItemId ? d.repo.diagnosisItems.get(h.relatedItemId) : null,
    d.repo.experiments.list({ projectId, hypothesisId }),
  ]);

  const ownerProfile = project ? await d.repo.profiles.get(project.ownerId) : null;
  const founderOnboarding = ownerProfile?.onboarding?.intent === "entrepreneur" ? ownerProfile.onboarding : undefined;

  const ctx: ExperimentSuggestionContext = {
    projectName: project?.name ?? "",
    projectNature: project ? (NATURE_LABEL[project.nature] ?? project.nature) : "",
    projectSummary: project?.description ?? "",
    hypothesis: {
      id: h.id,
      statement: h.statement,
      segment: h.segment,
      whyItMatters: h.whyItMatters,
      currentEvidence: h.currentEvidence,
      evaluationCriterion: h.evaluationCriterion,
      costOfBeingWrong: h.costOfBeingWrong,
      uncertainty: h.uncertainty,
      relatedProblemTitle: items?.title,
      relatedProblemContent: items?.content,
    },
    founderContext: founderOnboarding
      ? {
        stage: NATURE_LABEL[founderOnboarding.stage] ?? founderOnboarding.stage,
        sector: founderOnboarding.sector,
        weeklyHours: founderOnboarding.weeklyHours,
      }
      : undefined,
    previousExperiments: experiments.map((e) => ({ question: e.question, method: e.method })),
  };

  try {
    const result = await d.ai.suggestExperiment(ctx);
    await audit(d, "ai.invoked", {
      projectId,
      targetId: hypothesisId,
      meta: { task: "experiment_suggestion", provider: result.provider },
    });
    return result.suggestion;
  } catch (e) {
    await audit(d, "ai.failed", {
      projectId,
      targetId: hypothesisId,
      meta: {
        task: "experiment_suggestion",
        reason: e instanceof AiUnavailableError ? e.reason : "unknown",
      },
    });
    throw e;
  }
}

/* ───────────── Evidencia ───────────── */

export const EVIDENCE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv"],
} as const;

export async function addEvidence(
  d: ServiceDeps,
  projectId: string,
  input: { kind: EvidenceKind; title: string; description: string; url?: string; file?: { name: string; mimeType: string; sizeBytes: number } },
): Promise<Evidence> {
  await guard(d, projectId, "evidence.add");
  const title = input.title.trim();
  if (!title) throw validation("Poné un título a la evidencia.");
  let url: string | undefined;
  if (input.kind === "link") {
    try {
      const u = new URL(input.url ?? "");
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      url = u.toString();
    } catch {
      throw validation("El enlace no es una URL válida (http o https).");
    }
  }
  if (input.kind === "file") {
    const f = input.file;
    if (!f) throw validation("Falta el archivo.");
    if (!(EVIDENCE_LIMITS.mimeTypes as readonly string[]).includes(f.mimeType)) throw validation("Tipo de archivo no permitido. Usá PDF, imagen, texto o CSV.");
    if (f.sizeBytes <= 0 || f.sizeBytes > EVIDENCE_LIMITS.maxBytes) throw validation("El archivo debe pesar menos de 10 MB.");
  }
  const ev: Evidence = {
    id: d.newId("ev"),
    projectId,
    kind: input.kind,
    title: title.slice(0, 160),
    description: input.description.trim().slice(0, 2000),
    url,
    file: input.kind === "file" && input.file ? { name: input.file.name.slice(0, 200), mimeType: input.file.mimeType, sizeBytes: input.file.sizeBytes } : undefined,
    uploadedBy: d.actor.id,
    createdAt: d.now(),
  };
  await d.repo.evidence.insert(ev);
  await audit(d, "evidence.added", { projectId, targetId: ev.id, meta: { kind: ev.kind } });
  await touch(d, projectId);
  return ev;
}

/* ───────────── Tareas ───────────── */

export async function createTask(
  d: ServiceDeps,
  projectId: string,
  input: {
    title: string;
    experimentId?: string;
    assigneeId?: string;
    dueDate?: string;
    actionType?: ActionType;
    milestoneId?: string;
    goalId?: string;
    blockedReason?: string;
  },
): Promise<Task> {
  await guard(d, projectId, "task.manage");
  const title = input.title.trim();
  if (!title) throw validation("La tarea necesita un título.");
  if (input.experimentId) {
    const e = await d.repo.experiments.get(input.experimentId);
    if (!e || e.projectId !== projectId) throw notFound("El experimento no pertenece a este proyecto.");
  }
  if (input.milestoneId) {
    const m = await d.repo.roadmapMilestones.get(input.milestoneId);
    if (!m || m.projectId !== projectId) throw notFound("El hito no pertenece a este proyecto.");
  }
  if (input.goalId) {
    const g = await d.repo.mentorshipGoals.get(input.goalId);
    if (!g || g.projectId !== projectId) throw notFound("El objetivo no pertenece a este proyecto.");
  }
  const actionType: ActionType = input.actionType ?? (input.experimentId ? "experiment" : "operational_task");
  const now = d.now();
  const t: Task = {
    id: d.newId("task"),
    projectId,
    title: title.slice(0, 200),
    actionType,
    milestoneId: input.milestoneId,
    goalId: input.goalId,
    experimentId: input.experimentId,
    assigneeId: input.assigneeId ?? d.actor.id,
    status: input.blockedReason?.trim() ? "blocked" : "todo",
    dueDate: input.dueDate,
    blockedReason: input.blockedReason?.trim().slice(0, 500),
    createdAt: now,
    updatedAt: now,
  };
  await d.repo.tasks.insert(t);
  return t;
}

export async function createTasksBatch(
  d: ServiceDeps,
  projectId: string,
  tasks: Array<{
    title: string;
    experimentId?: string;
    assigneeId?: string;
    dueDate?: string;
    actionType?: ActionType;
    milestoneId?: string;
    goalId?: string;
    blockedReason?: string;
  }>,
): Promise<Task[]> {
  await guard(d, projectId, "task.manage");
  const created: Task[] = [];
  for (const t of tasks) {
    const row = await createTask(d, projectId, t);
    created.push(row);
  }
  return created;
}

/** Sugiere tareas operativas con IA para ejecutar un experimento a partir de su contexto */
export async function suggestExperimentTasks(d: ServiceDeps, projectId: string, experimentId: string): Promise<ExperimentTasksSuggestion> {
  await guard(d, projectId, "task.manage");
  const exp = await d.repo.experiments.get(experimentId);
  if (!exp || exp.projectId !== projectId) throw notFound("El experimento no pertenece a este proyecto.");

  const [project, hyp, allTasks] = await Promise.all([
    d.repo.projects.get(projectId),
    d.repo.hypotheses.get(exp.hypothesisId),
    d.repo.tasks.list({ projectId, experimentId }),
  ]);

  const ownerProfile = project ? await d.repo.profiles.get(project.ownerId) : null;
  const founderOnboarding = ownerProfile?.onboarding?.intent === "entrepreneur" ? ownerProfile.onboarding : undefined;

  const ctx: ExperimentTasksContext = {
    projectName: project?.name ?? "",
    projectNature: project ? (NATURE_LABEL[project.nature] ?? project.nature) : "",
    projectSummary: project?.description ?? "",
    hypothesis: hyp
      ? {
        statement: hyp.statement,
        segment: hyp.segment,
        evaluationCriterion: hyp.evaluationCriterion,
      }
      : undefined,
    experiment: {
      id: exp.id,
      question: exp.question,
      method: exp.method,
      participants: exp.participants,
      activities: exp.activities,
      resources: exp.resources,
      durationDays: exp.durationDays,
      budget: exp.budget,
      metric: exp.metric,
      successCriterion: exp.successCriterion,
      rejectionCriterion: exp.rejectionCriterion,
      evidencePlan: exp.evidencePlan,
      risks: exp.risks,
      status: exp.status,
    },
    founderContext: founderOnboarding
      ? {
        stage: NATURE_LABEL[founderOnboarding.stage] ?? founderOnboarding.stage,
        sector: founderOnboarding.sector,
        weeklyHours: founderOnboarding.weeklyHours,
      }
      : undefined,
    existingTasks: allTasks.map((t) => ({ title: t.title, status: t.status })),
  };

  try {
    const result = await d.ai.suggestExperimentTasks(ctx);
    await audit(d, "ai.invoked", {
      projectId,
      targetId: experimentId,
      meta: { task: "experiment_tasks_suggestion", provider: result.provider },
    });
    return result.suggestion;
  } catch (e) {
    await audit(d, "ai.failed", {
      projectId,
      targetId: experimentId,
      meta: {
        task: "experiment_tasks_suggestion",
        reason: e instanceof AiUnavailableError ? e.reason : "unknown",
      },
    });
    throw e;
  }
}

export async function setTaskStatus(d: ServiceDeps, taskId: string, status: TaskStatus) {
  const t = await d.repo.tasks.get(taskId);
  if (!t) throw notFound();
  await guard(d, t.projectId, "task.manage");
  return d.repo.tasks.update(taskId, { status, updatedAt: d.now() });
}
