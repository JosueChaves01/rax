"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  Comment,
  DiagnosisCategory,
  EvidenceKind,
  Experiment,
  InfoType,
  InitiativeNature,
  MentorDecision,
  MentorSessionKind,
  ProjectDocumentFileType,
  ProjectStatus,
  ResultOutcome,
  SessionNoteKind,
  TaskStatus,
  MilestoneStatus,
  CompatibilityStatus,
  GoalStatus,
  MentorshipStage,
  Uncertainty,
  AgreementFrequency,
  MentorAssignment,
  MentorshipAgreement,
  MentorshipRelation,
  Project,
} from "@/types/domain";
import { getDeps, homeFor } from "@/lib/runtime";
import { createUserClient } from "@/lib/supabase/server";
import { appUrl, missingConfig } from "@/lib/supabase/config";
import { completeOnboarding } from "@/lib/services/onboarding";
import { isDomainError, validation } from "@/lib/errors";
import { audit, guard, sysRepo, type ServiceDeps } from "@/lib/services/base";
import type { ItemChange } from "@/features/diagnosis/rules";
import { createProject, setConversationSharing, setProjectStatus } from "@/lib/services/projects";
import { addComment, addItem, changeItem, confirmSummary, editSummary } from "@/lib/services/diagnosis";
import {
  addNote,
  addNotesBatch,
  adoptPostSessionCommitments,
  completeFirstReview,
  completeSecondReview,
  completeSession,
  generatePostSessionSynthesis,
  generatePreSessionBriefing,
  requestReview,
  scheduleSession,
  startSession,
  suggestFirstReview,
} from "@/lib/services/mentoring";
import {
  addEvidence,
  approveHypothesis,
  createExperiment,
  createTask,
  createTasksBatch,
  discardHypothesis,
  markExperimentReady,
  proposeHypothesis,
  recordResult,
  reformulateHypothesis,
  returnHypothesis,
  setTaskStatus,
  startExperiment,
  submitHypothesis,
  suggestExperiment,
  suggestExperimentTasks,
  suggestHypotheses,
  updateExperiment,
  type ExperimentInput,
  type HypothesisInput,
} from "@/lib/services/validation";
import { assignMentor, reviewMentorApplication, revokeMentor } from "@/lib/services/admin";
import {
  confirmMentorshipAgreement,
  createMentorshipGoal,
  decideCompatibility,
  initiateMentorshipRelation,
  saveMentorshipAgreement,
  suggestGoalsAndAgreement,
  transitionMentorshipStage,
  updateMentorshipGoalStatus,
  type MentorshipAgreementInput,
  type MentorshipGoalInput,
} from "@/lib/services/mentorship-relation";
import {
  attachEvidenceToTask,
  createMilestone,
  deleteMilestone,
  diagnoseTaskDelay,
  setTaskBlocked,
  updateMilestone,
  updateMilestoneStatus,
  type DelayDiagnosisInput,
  type MilestoneInput,
} from "@/lib/services/roadmap";
import { dismissIntervention } from "@/lib/services/portfolio";
import { createResource } from "@/lib/services/resources";
import { recordCycleEvaluation } from "@/lib/services/evaluation";
import {
  appendAgentAssistantMessage,
  appendAgentUserMessage,
  authorizedThread,
  createAgentThread,
  getAgentThread,
  getOrCreateAgentThread,
  listAgentMessages,
  listProjectThreads,
  renameAgentThread,
} from "@/lib/services/agent-chat";
import {
  addProjectDocument,
  deleteProjectDocument,
  getProjectKnowledgeStats,
  listProjectDocuments,
  promoteDecisionToKnowledge,
  updateProjectInstructions,
} from "@/lib/services/project-knowledge";
import { getProjectKnowledgeContext } from "@/lib/ai/knowledge-retrieval";
import { executeClaudeAgentTurn, type SessionContext } from "@/lib/ai/claude-orchestrator";
import { AiProposalItemSchema } from "@/lib/n8n/contracts";
import { dispatchEventToN8n } from "@/lib/n8n/dispatcher";
import { generateMentorshipExplorationData, type MentorshipExplorationAiResult } from "@/lib/ai/exploration-ai";
import { canUseCapability, invokeMainAgent, MainAgentChatInputSchema, selectRaxCapability } from "@/lib/n8n/main-agent";
import type { MentorIntervention } from "@/types/domain";
import * as V from "@/lib/validation/inputs";

export type ActionResult<T = undefined> = { ok: true; data?: T; notice?: string } | { ok: false; error: string; code?: string };

/**
 * Envoltorio común: exige sesión, traduce errores de dominio a mensajes seguros
 * (sin detalles internos) y revalida el espacio de trabajo.
 */
async function run<T>(projectId: string | null, fn: (d: ServiceDeps) => Promise<T>): Promise<ActionResult<T>> {
  const d = await getDeps();
  if (!d) return { ok: false, error: "Tu sesión terminó. Volvé a entrar.", code: "unauthenticated" };
  try {
    const data = await fn(d);
    if (projectId) revalidatePath(`/app/p/${projectId}`, "layout");
    revalidatePath("/app", "layout");
    return { ok: true, data };
  } catch (e) {
    if (isDomainError(e)) return { ok: false, error: e.message, code: e.code };
    console.error("[rax] acción fallida", e);
    return { ok: false, error: "Algo salió mal. Tus datos guardados no se perdieron; probá de nuevo." };
  }
}

/* ── Cuenta (Supabase Auth) ── */

export type AuthState = { error?: string; notice?: string; name?: string; email?: string } | undefined;

const safeNext = (next: FormDataEntryValue | null) => {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/app") || n.startsWith("/bienvenida") ? n : null;
};

/** Mensajes de Supabase Auth traducidos; nunca se muestra el error crudo. */
function authMessage(code: string | undefined, fallback: string) {
  switch (code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Todavía no confirmaste tu correo. Revisá tu bandeja (y la carpeta de spam).";
    case "user_already_exists":
    case "email_exists":
      return "Ya hay una cuenta con ese correo. Probá entrar.";
    case "weak_password":
      return "La contraseña es muy débil: usá al menos 8 caracteres.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
    default:
      return fallback;
  }
}

export async function signInAction(_: AuthState, form: FormData): Promise<AuthState> {
  if (missingConfig().length) return { error: "RAX todavía no está conectado a Supabase." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Completá correo y contraseña.", email };
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authMessage(error.code, "No pudimos iniciar sesión. Probá de nuevo."), email };
  const d = await getDeps();
  redirect(safeNext(form.get("next")) ?? (d ? homeFor(d.actor) : "/bienvenida"));
}

export async function signUpAction(_: AuthState, form: FormData): Promise<AuthState> {
  if (missingConfig().length) return { error: "RAX todavía no está conectado a Supabase." };
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (name.length < 2) return { error: "Contanos cómo te llamás.", name, email };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Revisá el correo.", name, email };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres.", name, email };
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: name.slice(0, 120) }, emailRedirectTo: `${appUrl()}/auth/callback?next=/bienvenida` },
  });
  if (error) return { error: authMessage(error.code, "No pudimos crear la cuenta. Probá de nuevo."), name, email };
  // Si el proyecto pide confirmar el correo, no hay sesión todavía.
  if (!data.session) return { notice: `Te enviamos un correo a ${email}. Abrí el enlace para confirmar tu cuenta y seguimos.` };
  redirect("/bienvenida");
}

/**
 * Entrar o registrarse con Google (Supabase OAuth). La primera vez crea la cuenta;
 * el callback lleva a /bienvenida, que manda al onboarding o a la casa de cada rol.
 */
export async function googleSignInAction(_: AuthState, form: FormData): Promise<AuthState> {
  if (missingConfig().length) return { error: "RAX todavía no está conectado a Supabase." };
  // El origen del pedido sirve también en los despliegues de vista previa; Supabase solo acepta las URLs permitidas.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : appUrl();
  const next = safeNext(form.get("next")) ?? "/bienvenida";
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) return { error: "No pudimos conectar con Google. Probá de nuevo o usá tu correo." };
  redirect(data.url);
}

export async function signOutAction() {
  if (!missingConfig().length) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  redirect("/entrar");
}

/* ── Onboarding ── */

export async function completeOnboardingAction(input: unknown) {
  const res = await run(null, async (d) => {
    const r = await completeOnboarding(d, V.parse(V.OnboardingInput, input));
    return { home: r.project ? `/app/p/${r.project.id}/conversacion` : homeFor(r.profile) };
  });
  if (res.ok && res.data) redirect(res.data.home);
  return res;
}

/* ── Proyectos ── */

export async function createProjectAction(input: { name: string; description: string; nature: InitiativeNature }) {
  const res = await run(null, (d) => createProject(d, V.parse(V.NewProject, input)));
  if (res.ok && res.data) redirect(`/app/p/${res.data.id}/conversacion`);
  return res.ok ? { ok: true as const } : res;
}

export const setProjectStatusAction = async (projectId: string, status: ProjectStatus) =>
  run(projectId, (d) => setProjectStatus(d, V.parse(V.Ids, projectId), V.parse(V.ProjectStatus, status)));
export const setSharingAction = async (projectId: string, share: boolean) =>
  run(projectId, (d) => setConversationSharing(d, V.parse(V.Ids, projectId), share === true));

/* ── Conversación ── */

export async function sendMessageAction(projectId: string, content: string) {
  const checkedProjectId = V.parse(V.Ids, projectId);
  const checkedContent = V.parse(V.Text(4000), content);
  const result = await sendMainAgentMessageAction({ projectId: checkedProjectId, stage: "conversation", message: checkedContent });
  if (!result.ok) return result;
  const turn = result.data;
  if (!turn) return { ok: false as const, error: "No se pudo guardar el mensaje." };
  return {
    ok: true as const,
    data: {
      aiError: turn.ok ? null : turn.message,
      proposals: turn.ok ? turn.proposals.length : 0,
      summaryDrafted: false,
      reply: turn.ok ? turn.reply : turn.message,
      threadId: turn.threadId,
    },
  };
}

/* ── Diagnóstico ── */

export const changeItemAction = async (projectId: string, itemId: string, change: ItemChange, expectedVersion: number) =>
  run(projectId, async (d) => {
    await changeItem(d, V.parse(V.Ids, itemId), V.parse(V.ItemChange, change), V.parse(V.Version, expectedVersion));
  });
export const addItemAction = async (
  projectId: string,
  input: { category: DiagnosisCategory; title: string; content: string; uncertainty: Uncertainty; infoType?: InfoType },
) =>
  run(projectId, async (d) => {
    await addItem(d, V.parse(V.Ids, projectId), V.parse(V.NewItem, input));
  });
export const editSummaryAction = async (projectId: string, summary: string) => run(projectId, (d) => editSummary(d, V.parse(V.Ids, projectId), V.parse(V.Text(3000), summary)));
export const confirmSummaryAction = async (projectId: string) => run(projectId, (d) => confirmSummary(d, V.parse(V.Ids, projectId)));
export const addCommentAction = async (projectId: string, targetType: Comment["targetType"], targetId: string, body: string) =>
  run(projectId, async (d) => {
    await addComment(d, V.parse(V.Ids, projectId), V.parse(V.CommentTarget, targetType), V.parse(V.Ids, targetId), V.parse(V.Text(2000), body));
  });

/* ── Mentoría ── */

export const requestReviewAction = async (projectId: string, kind: MentorSessionKind) =>
  run(projectId, async (d) => {
    await requestReview(d, V.parse(V.Ids, projectId), V.parse(V.SessionKind, kind));
  });
export const startSessionAction = async (projectId: string, sessionId: string) =>
  run(projectId, async (d) => {
    await startSession(d, V.parse(V.Ids, sessionId));
  });
export const scheduleSessionAction = async (
  projectId: string,
  input: { kind: MentorSessionKind; scheduledAt?: string; relationId?: string },
) =>
  run(projectId, async (d) => {
    return scheduleSession(d, V.parse(V.Ids, projectId), {
      kind: V.parse(V.SessionKind, input.kind),
      scheduledAt: input.scheduledAt,
      relationId: input.relationId ? V.parse(V.Ids, input.relationId) : undefined,
    });
  });

export const generatePreSessionBriefingAction = async (projectId: string, sessionId: string) =>
  run(projectId, async (d) => {
    const res = await generatePreSessionBriefing(d, V.parse(V.Ids, sessionId));
    revalidatePath(`/app/p/${projectId}/orientar`);
    revalidatePath(`/app/p/${projectId}/mentoria`);
    return res;
  });

export const generatePostSessionSynthesisAction = async (projectId: string, sessionId: string) =>
  run(projectId, async (d) => {
    const res = await generatePostSessionSynthesis(d, V.parse(V.Ids, sessionId));
    revalidatePath(`/app/p/${projectId}/orientar`);
    revalidatePath(`/app/p/${projectId}/mentoria`);
    return res;
  });

export const adoptPostSessionCommitmentsAction = async (
  projectId: string,
  sessionId: string,
  selectedIndices?: number[],
) =>
  run(projectId, async (d) => {
    return adoptPostSessionCommitments(d, V.parse(V.Ids, sessionId), selectedIndices);
  });

export const completeSessionAction = async (projectId: string, sessionId: string, summary?: string) =>
  run(projectId, async (d) => {
    return completeSession(d, V.parse(V.Ids, sessionId), summary);
  });

export const addNoteAction = async (
  projectId: string,
  sessionId: string,
  kind: SessionNoteKind,
  body: string,
  relatedItemId?: string,
  isPrivate?: boolean,
) =>
  run(projectId, async (d) => {
    await addNote(
      d,
      V.parse(V.Ids, sessionId),
      V.parse(V.NoteKind, kind),
      V.parse(V.Text(2000), body),
      relatedItemId ? V.parse(V.Ids, relatedItemId) : undefined,
      isPrivate === true,
    );
  });
export const suggestFirstReviewAction = async (projectId: string, sessionId: string) =>
  run(projectId, async (d) => {
    return suggestFirstReview(d, V.parse(V.Ids, sessionId));
  });
export const addNotesBatchAction = async (
  projectId: string,
  sessionId: string,
  notes: Array<{ kind: SessionNoteKind; body: string; relatedItemId?: string | null; isPrivate?: boolean }>,
) =>
  run(projectId, async (d) => {
    return addNotesBatch(
      d,
      V.parse(V.Ids, sessionId),
      notes.map((n) => ({
        kind: V.parse(V.NoteKind, n.kind),
        body: V.parse(V.Text(2000), n.body),
        relatedItemId: n.relatedItemId ? V.parse(V.Ids, n.relatedItemId) : undefined,
        isPrivate: n.isPrivate === true,
      })),
    );
  });
export const completeFirstReviewAction = async (projectId: string, sessionId: string, agreement: string) =>
  run(projectId, (d) => completeFirstReview(d, V.parse(V.Ids, sessionId), V.parse(V.Text(2000), agreement)));
export const completeSecondReviewAction = async (
  projectId: string,
  sessionId: string,
  decision: MentorDecision,
  justification: string,
  hypothesisId: string,
) =>
  run(projectId, (d) =>
    completeSecondReview(d, V.parse(V.Ids, sessionId), V.parse(V.Decision, decision), V.parse(V.Text(2000), justification), V.parse(V.Ids, hypothesisId)),
  );

/* ── Hipótesis y experimentos ── */

export const suggestHypothesesAction = async (projectId: string) =>
  run(projectId, async (d) => {
    return suggestHypotheses(d, V.parse(V.Ids, projectId));
  });

export const proposeHypothesisAction = async (projectId: string, input: HypothesisInput) =>
  run(projectId, async (d) => {
    await proposeHypothesis(d, V.parse(V.Ids, projectId), V.parse(V.HypothesisInput, input));
  });
export const hypothesisTransitionAction = async (projectId: string, id: string, to: "submit" | "approve" | "return" | "discard") =>
  run(projectId, async (d) => {
    const fn = { submit: submitHypothesis, approve: approveHypothesis, return: returnHypothesis, discard: discardHypothesis }[to];
    if (!fn) throw new Error("transición desconocida");
    await fn(d, V.parse(V.Ids, id));
  });
export const reformulateHypothesisAction = async (projectId: string, id: string, input: HypothesisInput) =>
  run(projectId, async (d) => {
    await reformulateHypothesis(d, V.parse(V.Ids, id), V.parse(V.HypothesisInput, input));
  });

export const suggestExperimentAction = async (projectId: string, hypothesisId: string) =>
  run(projectId, async (d) => {
    return suggestExperiment(d, V.parse(V.Ids, projectId), V.parse(V.Ids, hypothesisId));
  });

export const createExperimentAction = async (projectId: string, hypothesisId: string, input: ExperimentInput) =>
  run(projectId, async (d) => {
    await createExperiment(d, V.parse(V.Ids, hypothesisId), V.parse(V.ExperimentInput, input));
  });
export const updateExperimentAction = async (projectId: string, id: string, input: Partial<ExperimentInput>, expectedVersion: number) =>
  run(projectId, async (d) => {
    await updateExperiment(d, V.parse(V.Ids, id), V.parse(V.ExperimentInput.partial(), input), V.parse(V.Version, expectedVersion));
  });
export const experimentTransitionAction = async (projectId: string, id: string, to: "ready" | "start") =>
  run(projectId, async (d) => {
    const eid = V.parse(V.Ids, id);
    await (to === "ready" ? markExperimentReady(d, eid) : startExperiment(d, eid));
  });
export const recordResultAction = async (
  projectId: string,
  experimentId: string,
  input: { outcome: ResultOutcome; observed: string; metricValue: string; learnings: string; limitations: string; evidenceIds: string[] },
) =>
  run(projectId, async (d) => {
    await recordResult(d, V.parse(V.Ids, experimentId), V.parse(V.ResultInput, input));
  });

/* ── Evidencia y tareas ── */

export const addEvidenceAction = async (
  projectId: string,
  input: { kind: EvidenceKind; title: string; description: string; url?: string; file?: { name: string; mimeType: string; sizeBytes: number } },
) =>
  run(projectId, async (d) => {
    await addEvidence(d, V.parse(V.Ids, projectId), V.parse(V.EvidenceInput, input));
  });
export const createTaskAction = async (
  projectId: string,
  input: Parameters<typeof createTask>[2],
) =>
  run(projectId, async (d) => {
    return await createTask(d, V.parse(V.Ids, projectId), V.parse(V.TaskInput, input));
  });
export const createTasksBatchAction = async (
  projectId: string,
  tasks: Parameters<typeof createTasksBatch>[2],
) =>
  run(projectId, async (d) => {
    return createTasksBatch(
      d,
      V.parse(V.Ids, projectId),
      V.parse(V.TasksBatchInput, tasks),
    );
  });
export const suggestExperimentTasksAction = async (projectId: string, experimentId: string) =>
  run(projectId, async (d) => {
    return suggestExperimentTasks(d, V.parse(V.Ids, projectId), V.parse(V.Ids, experimentId));
  });
export const setTaskStatusAction = async (projectId: string, taskId: string, status: TaskStatus) =>
  run(projectId, async (d) => {
    await setTaskStatus(d, V.parse(V.Ids, taskId), V.parse(V.TaskStatus, status));
  });

export const requestTaskProposalsAction = async (projectId: string) =>
  run(projectId, async (d) => {
    const relations = await d.repo.mentorshipRelations.list({ projectId });
    const goals =
      relations.length > 0
        ? (await Promise.all(relations.map((r) => d.repo.mentorshipGoals.list({ relationId: r.id })))).flat()
        : [];
    const existingTasks = await d.repo.tasks.list({ projectId });
    const now = d.now();
    const dispatch = await dispatchEventToN8n({
      eventId: d.newId("evt"),
      eventType: "task.proposals_requested",
      occurredAt: now,
      schemaVersion: "1.0.0",
      correlationId: `corr_tasks_${Date.now()}`,
      actor: { id: d.actor.id, role: d.actor.role, verified: true },
      projectId,
      entityType: "project",
      entityId: projectId,
      payload: {
        goals: goals.map((g) => ({ id: g.id, title: g.title, status: g.status })),
        existingTasks: existingTasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
        contextSource: "tasks_dashboard",
      },
    });
    return { dispatched: dispatch.ok, error: dispatch.error, status: dispatch.status };
  });

/* ── Hoja de Ruta y Tareas Multimodales ── */

export const createMilestoneAction = async (projectId: string, input: MilestoneInput) =>
  run(projectId, async (d) => {
    return createMilestone(d, V.parse(V.Ids, projectId), V.parse(V.MilestoneInput, input));
  });

export const updateMilestoneAction = async (
  projectId: string,
  milestoneId: string,
  patch: Partial<MilestoneInput>,
) =>
  run(projectId, async (d) => {
    return updateMilestone(d, V.parse(V.Ids, milestoneId), patch);
  });

export const updateMilestoneStatusAction = async (
  projectId: string,
  milestoneId: string,
  status: MilestoneStatus,
) =>
  run(projectId, async (d) => {
    return updateMilestoneStatus(d, V.parse(V.Ids, milestoneId), V.parse(V.MilestoneStatus, status));
  });

export const deleteMilestoneAction = async (projectId: string, milestoneId: string) =>
  run(projectId, async (d) => {
    await deleteMilestone(d, V.parse(V.Ids, milestoneId));
  });

export const improveDocumentWithAIAction = async (input: {
  title: string;
  conclusion: string;
  argumentsText: string;
  dataText: string;
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> => {
  void input;
  return { ok: false as const, error: "La mejora con IA estará disponible cuando esta pantalla use el agente principal con un proyecto autorizado." };
};

/**
 * Evalúa un ejercicio con el mismo agente del chat del proyecto (OpenRouter directo, sin n8n).
 * Si la IA no está disponible no se inventa una nota: se devuelve el motivo.
 */
export const evaluateExerciseAction = async (
  projectId: string,
  exerciseText: string,
): Promise<{ ok: true; score: string; feedback: string } | { ok: false; error: string }> => {
  const text = exerciseText.trim().slice(0, 8000);
  if (!text) return { ok: false, error: "Escribe o pega tu ejercicio para evaluarlo." };
  const res = await run(projectId, async (d) => {
    const { project } = await guard(d, V.parse(V.Ids, projectId), "agent.chat");
    const knowledge = await getProjectKnowledgeContext(d.repo, project.id, text);
    return executeClaudeAgentTurn({
      project,
      userMessage: `Evalúa este ejercicio como tutor. Empieza tu respuesta con una línea exacta «Puntaje: N/10» y luego da retroalimentación concreta: qué está bien, qué corregir y un siguiente paso.\n\n${text}`,
      history: [],
      knowledge,
      role: d.actor.role,
      sessionContext: { location: "evaluation", pageTitle: "Aprendizaje · Evaluación de ejercicio" },
    });
  });
  if (!res.ok) return { ok: false, error: res.error };
  const turn = res.data!;
  if (turn.cacheStatus === "simulated") {
    return { ok: false, error: "La IA no está disponible en este momento (sin clave o sin cupo en OpenRouter), así que no se puede evaluar el ejercicio." };
  }
  const match = turn.reply.match(/puntaje:\s*([\d.,]+\s*\/\s*10)/i);
  return { ok: true, score: match ? match[1].replace(/\s+/g, "") : "—", feedback: turn.reply.replace(/^.*puntaje:.*$/im, "").trim() };
};

export const completeExplorationAction = async (input: {
  motivation: string;
  description: string;
}) => {
  const d = await getDeps();
  if (!d) return { ok: false, error: "No autenticado" };

  const projects = await d.repo.projects.list({ ownerId: d.actor.id });
  const primary = projects[0];
  if (!primary) return { ok: true, notice: "Exploración completada." };

  const relations = await d.repo.mentorshipRelations.list({ projectId: primary.id });
  const rel = relations[0];
  let dispatchOk = false;
  if (rel) {
    const now = d.now();
    await d.repo.mentorshipRelations.update(rel.id, {
      compatibilityStatus: "proceed",
      compatibilityRationale: `Motivación: ${input.motivation}. Descripción: ${input.description}`,
      stage: "diagnosis",
      updatedAt: now,
    });
    const dispatch = await dispatchEventToN8n({
      eventId: d.newId("evt"),
      eventType: "onboarding.completed",
      occurredAt: now,
      schemaVersion: "1.0.0",
      correlationId: `expl_${primary.id}`,
      actor: { id: d.actor.id, role: d.actor.role, verified: true },
      relationshipId: rel.id,
      projectId: primary.id,
      entityType: "project",
      entityId: primary.id,
      payload: { motivation: input.motivation, description: input.description },
    });
    dispatchOk = dispatch.ok;
  }

  return {
    ok: true,
    notice: dispatchOk
      ? "Exploración y compatibilidad guardadas. El evento llegó a la entrada de n8n; el flujo especializado aún no está verificado."
      : "Exploración y compatibilidad guardadas. n8n no está disponible y no se ejecutó ningún flujo.",
  };
};

export interface ExplorationCreateProjectInput {
  initiativeName: string;
  sector: string;
  nature?: InitiativeNature;
  summary?: string;
  motivation: string;
  description: string;
  mentorId?: string;
  compatibilityRationale?: string;
  agreement: {
    frequency: AgreementFrequency;
    sessionDurationMinutes?: number;
    expectedDurationWeeks?: number;
    cycleGoals?: string;
    scope?: string;
    mentorCommitments?: string;
    entrepreneurCommitments?: string;
    confidentialityTerms?: string;
    authorizedChannels?: string[];
  };
}

export const completeExplorationAndCreateProjectAction = async (input: ExplorationCreateProjectInput) => {
  const d = await getDeps();
  if (!d) return { ok: false as const, error: "Tu sesión terminó. Volvé a entrar.", code: "unauthenticated" };

  try {
    // La exploración la inicia el emprendedor: el proyecto queda a su nombre y el mentor
    // elegido tiene que ser un mentor aprobado. Todo se escribe con permisos de sistema,
    // así que nada que venga del cliente se usa sin verificar.
    if (d.actor.role !== "entrepreneur") {
      return {
        ok: false as const,
        error: "La exploración la inicia la persona emprendedora desde su cuenta.",
        code: "forbidden",
      };
    }

    const sys = sysRepo(d);
    const allProfiles = await sys.profiles.list().catch(() => []);
    const approvedMentors = allProfiles.filter((p) => p.role === "mentor" && p.mentorStatus === "approved" && p.id !== d.actor.id);
    const entrepreneurId = d.actor.id;
    const mentorId = input.mentorId
      ? approvedMentors.find((p) => p.id === input.mentorId)?.id
      : approvedMentors[0]?.id;

    if (!mentorId) {
      return {
        ok: false as const,
        error: input.mentorId
          ? "El mentor elegido no está disponible. Elegí otro de la lista."
          : "No hay mentores disponibles en la plataforma para formalizar el acuerdo.",
        code: "validation",
      };
    }

    const now = d.now();
    const projectId = d.newId("prj");
    const projectName = (input.initiativeName?.trim() || "Iniciativa de Mentoría").slice(0, 80);
    const projectDesc = (
      input.summary?.trim() ||
      input.description?.trim() ||
      "Proyecto creado desde el flujo de exploración y mentoría."
    ).slice(0, 1000);

    const project: Project = {
      id: projectId,
      name: projectName,
      description: projectDesc,
      nature: input.nature || "exploring_idea",
      ownerId: entrepreneurId,
      status: "active",
      customInstructions: `Proyecto de mentoría enfocado en ${projectName} (${input.sector || "General"}). Objetivos del ciclo: ${input.agreement?.cycleGoals || input.agreement?.scope || "Validación y acompañamiento"}.`,
      shareConversationWithMentor: true,
      createdAt: now,
      updatedAt: now,
    };

    // El armado del proyecto desde exploración es un flujo orquestado por el sistema
    // (inserta membresía de dueño, conversación, diagnósticos, acuerdo y asignación)
    await sys.projects.insert(project);
    await audit(d, "project.created", { projectId, targetId: project.id });

    // Armado inicial del proyecto (membresía de dueño, conversación y diagnóstico)
    await sys.projectMembers.insert({
      id: `${projectId}:${entrepreneurId}`,
      projectId,
      profileId: entrepreneurId,
      role: "owner",
      createdAt: now,
    });
    const conv = await sys.conversations.insert({ id: d.newId("conv"), projectId, createdAt: now });
    await sys.diagnoses.insert({ id: d.newId("dx"), projectId, status: "exploring", updatedAt: now });
    await sys.messages.insert({
      id: d.newId("msg"),
      conversationId: conv.id,
      projectId,
      author: "assistant",
      content: `Hola. Este proyecto fue iniciado con un acuerdo de mentoría enfocado en «${projectName}». Los objetivos iniciales y términos ya están formalizados.`,
      dimension: "nature",
      createdAt: now,
    });

    // Inicializar el primer hilo del IA Assistant sincronizado para este proyecto
    const agr = input.agreement;
    const initialThread = await sys.agentThreads.insert({
      id: d.newId("agt"),
      projectId,
      creatorId: entrepreneurId,
      title: "Exploración y Acuerdo Inicial",
      isPinned: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await sys.agentMessages.insert({
      id: d.newId("agtmsg"),
      threadId: initialThread.id,
      projectId,
      author: "assistant",
      authorId: entrepreneurId,
      content: `¡Hola! Bienvenido a tu espacio de trabajo para «${projectName}».\n\nHe registrado tu acuerdo de mentoría preliminar (${agr?.frequency || "quincenal"}, ${agr?.sessionDurationMinutes || 60} min). Tus objetivos y compromisos ya están formalizados.\n\n¿En qué podemos enfocarnos hoy? Podés hacerme preguntas sobre tu plan de estudio o validación, pedirme que desglosamos tareas o preparar la agenda para tu próxima sesión.`,
      proposals: [],
      artifacts: [],
      citations: [],
      status: "complete",
      createdAt: now,
    });

    // Asignar mentor al proyecto (con permisos de sistema para cumplir con RLS de asignación)
    const assignment: MentorAssignment = {
      id: d.newId("asg"),
      projectId,
      mentorId,
      status: "active",
      assignedBy: d.actor.id,
      createdAt: now,
    };
    await sys.mentorAssignments.insert(assignment);
    await audit(d, "mentor.assigned", { projectId, targetId: assignment.id, meta: { mentorId } });

    // Crear relación de mentoría
    const relation: MentorshipRelation = {
      id: d.newId("rel"),
      projectId,
      entrepreneurId,
      mentorId,
      stage: "agreement",
      compatibilityStatus: "proceed",
      compatibilityRationale: (
        input.compatibilityRationale ||
        `Motivación: ${input.motivation}. Descripción: ${input.description}`
      ).slice(0, 2000),
      compatibilityDecidedAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await sys.mentorshipRelations.insert(relation);
    await audit(d, "mentorship.relation_created", {
      projectId,
      targetId: relation.id,
      meta: { mentorId, entrepreneurId },
    });

    // Guardar acuerdo formal
    const agreement: MentorshipAgreement = {
      id: d.newId("agr"),
      relationId: relation.id,
      version: 1,
      frequency: agr?.frequency || "biweekly",
      sessionDurationMinutes: Math.max(15, Math.min(240, agr?.sessionDurationMinutes || 60)),
      authorizedChannels: agr?.authorizedChannels || ["virtual", "email", "whatsapp"],
      scope: (agr?.scope || agr?.cycleGoals || "Acompañamiento en validación y crecimiento").trim().slice(0, 4000),
      mentorCommitments: (agr?.mentorCommitments || "Revisión quincenal de avances y feedback constructivo")
        .trim()
        .slice(0, 4000),
      entrepreneurCommitments: (
        agr?.entrepreneurCommitments || "Ejecución disciplinada de experimentos y reporte transparente"
      )
        .trim()
        .slice(0, 4000),
      confidentialityTerms: (
        agr?.confidentialityTerms || "Toda la información operativa se maneja bajo confidencialidad estricta"
      )
        .trim()
        .slice(0, 4000),
      expectedDurationWeeks: Math.max(1, Math.min(104, agr?.expectedDurationWeeks || 12)),
      status: "confirmed_by_entrepreneur",
      createdAt: now,
    };
    await sys.mentorshipAgreements.insert(agreement);
    await audit(d, "mentorship.agreement_updated", { projectId, targetId: agreement.id });

    // Notificar a n8n si está configurado
    dispatchEventToN8n({
      eventId: d.newId("evt"),
      eventType: "onboarding.completed",
      occurredAt: now,
      schemaVersion: "1.0.0",
      correlationId: `expl_${projectId}`,
      actor: { id: d.actor.id, role: d.actor.role, verified: true },
      relationshipId: relation.id,
      projectId,
      entityType: "project",
      entityId: projectId,
      payload: { motivation: input.motivation, description: input.description, initiativeName: projectName },
    }).catch(() => { });

    revalidatePath(`/app/p/${projectId}`, "layout");
    revalidatePath("/app/relaciones", "layout");
    revalidatePath("/app", "layout");

    return {
      ok: true as const,
      projectId,
      relationId: relation.id,
      notice: "Proyecto creado y acuerdo de mentoría formalizado con éxito.",
    };
  } catch (e) {
    console.error("[rax] error creando proyecto desde exploración:", e);
    if (isDomainError(e)) {
      console.error("[rax] domain error detail:", e.code, e.message);
      return { ok: false as const, error: e.message, code: e.code };
    }
    const msg = e instanceof Error ? e.message : "Error al procesar la creación.";
    return { ok: false as const, error: `No se pudo crear el proyecto: ${msg}` };
  }
};

export const loadExplorationContextAction = async () => {
  const d = await getDeps();
  if (!d) return { ok: false as const, error: "No autenticado" };

  try {
    const sys = sysRepo(d);
    const allProfiles = await sys.profiles.list().catch(() => []);
    const mentors = allProfiles.filter((p) => p.role === "mentor" && p.mentorStatus === "approved" && p.id !== d.actor.id);

    return {
      ok: true as const,
      actor: { id: d.actor.id, name: d.actor.name, role: d.actor.role },
      mentors: mentors.map((m) => ({ id: m.id, name: m.name, email: m.email })),
    };
  } catch (e) {
    if (isDomainError(e)) return { ok: false as const, error: e.message };
    return { ok: false as const, error: "Error al cargar contexto" };
  }
};

export const generateMentorshipExplorationWithAiAction = async (prompt?: string) => {
  const d = await getDeps();
  if (!d) return { ok: false as const, error: "No autenticado" };

  try {
    const sys = sysRepo(d);
    const allProfiles = await sys.profiles.list().catch(() => []);
    const firstMentor = allProfiles.find((p) => p.role === "mentor" && p.mentorStatus === "approved" && p.id !== d.actor.id);
    const preferredMentorName = firstMentor?.name || "Mentora Asignada (Lean & Estrategia)";

    const data: MentorshipExplorationAiResult = await generateMentorshipExplorationData(prompt, preferredMentorName);
    return { ok: true as const, data, mentorId: firstMentor?.id };
  } catch (e) {
    if (isDomainError(e)) return { ok: false as const, error: e.message };
    return { ok: false as const, error: "No se pudo generar la propuesta con IA." };
  }
};

export const diagnoseTaskDelayAction = async (
  projectId: string,
  taskId: string,
  input: DelayDiagnosisInput,
) =>
  run(projectId, async (d) => {
    return diagnoseTaskDelay(d, V.parse(V.Ids, taskId), V.parse(V.DelayHypothesisInput, input));
  });

export const setTaskBlockedAction = async (
  projectId: string,
  taskId: string,
  blockedReason: string,
) =>
  run(projectId, async (d) => {
    return setTaskBlocked(d, V.parse(V.Ids, taskId), blockedReason);
  });

export const attachEvidenceToTaskAction = async (
  projectId: string,
  taskId: string,
  evidenceId: string,
) =>
  run(projectId, async (d) => {
    return attachEvidenceToTask(d, V.parse(V.Ids, taskId), V.parse(V.Ids, evidenceId));
  });

/* ── Administración ── */

export const assignMentorAction = async (projectId: string, mentorId: string) =>
  run(null, async (d) => {
    await assignMentor(d, V.parse(V.Ids, projectId), V.parse(V.Ids, mentorId));
  });
export const reviewMentorAction = async (profileId: string, approve: boolean) =>
  run(null, async (d) => {
    await reviewMentorApplication(d, V.parse(V.Ids, profileId), approve === true);
  });
export const revokeMentorAction = async (assignmentId: string) =>
  run(null, async (d) => {
    await revokeMentor(d, V.parse(V.Ids, assignmentId));
  });

/* ── Relación, Acuerdos y Objetivos de Mentoría ── */

export const initiateMentorshipRelationAction = async (
  projectId: string,
  entrepreneurId: string,
  mentorId: string,
) =>
  run(projectId, async (d) => {
    return initiateMentorshipRelation(
      d,
      V.parse(V.Ids, projectId),
      V.parse(V.Ids, entrepreneurId),
      V.parse(V.Ids, mentorId),
    );
  });

export const decideCompatibilityAction = async (
  projectId: string,
  relationId: string,
  status: CompatibilityStatus,
  rationale?: string,
) =>
  run(projectId, async (d) => {
    return decideCompatibility(
      d,
      V.parse(V.Ids, relationId),
      V.parse(V.CompatibilityStatus, status),
      rationale,
    );
  });

export const transitionMentorshipStageAction = async (
  projectId: string,
  relationId: string,
  toStage: MentorshipStage,
) =>
  run(projectId, async (d) => {
    return transitionMentorshipStage(
      d,
      V.parse(V.Ids, relationId),
      V.parse(V.MentorshipStage, toStage),
    );
  });

export const saveMentorshipAgreementAction = async (
  projectId: string,
  relationId: string,
  input: MentorshipAgreementInput,
) =>
  run(projectId, async (d) => {
    return saveMentorshipAgreement(
      d,
      V.parse(V.Ids, relationId),
      V.parse(V.MentorshipAgreementInput, input),
    );
  });

export const confirmMentorshipAgreementAction = async (
  projectId: string,
  agreementId: string,
) =>
  run(projectId, async (d) => {
    return confirmMentorshipAgreement(d, V.parse(V.Ids, agreementId));
  });

export const createMentorshipGoalAction = async (
  projectId: string,
  relationId: string,
  input: MentorshipGoalInput,
) =>
  run(projectId, async (d) => {
    return createMentorshipGoal(
      d,
      V.parse(V.Ids, relationId),
      V.parse(V.MentorshipGoalInput, input),
    );
  });

export const updateMentorshipGoalStatusAction = async (
  projectId: string,
  goalId: string,
  status: GoalStatus,
) =>
  run(projectId, async (d) => {
    return updateMentorshipGoalStatus(
      d,
      V.parse(V.Ids, goalId),
      V.parse(V.GoalStatus, status),
    );
  });

export const suggestGoalsAndAgreementAction = async (
  projectId: string,
  relationId: string,
) =>
  run(projectId, async (d) => {
    return suggestGoalsAndAgreement(
      d,
      V.parse(V.Ids, projectId),
      V.parse(V.Ids, relationId),
    );
  });

/* ── Productividad del Mentor y Recursos ── */

export const dismissInterventionAction = async (input: {
  relationId: string;
  category: MentorIntervention["category"];
  interventionId?: string;
}) =>
  run(null, async (d) => {
    await dismissIntervention(d, input);
  });

export const createResourceAction = async (input: unknown) =>
  run(null, async (d) => {
    return createResource(d, input);
  });

/* ── Evaluación de Ciclo y Cierre/Renovación ── */

export const recordCycleEvaluationAction = async (
  projectId: string,
  input: unknown,
) =>
  run(projectId, async (d) => {
    return recordCycleEvaluation(d, input);
  });

/* ── Chat contextual del agente principal ── */

/** Chat principal contextualizado por RAX: actor, proyecto y datos se resuelven en el servidor. */
export async function sendMainAgentMessageAction(input: unknown) {
  const parsed = MainAgentChatInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "El mensaje o el contexto del formulario no son válidos." };

  return run(parsed.data.projectId, async (d) => {
    const { project } = await guard(d, parsed.data.projectId, "agent.chat");
    const turn = { ...parsed.data, role: d.actor.role };
    const selection = selectRaxCapability(turn);
    if (!canUseCapability(d.actor.role, selection.primary, [selection.requiredAction])) {
      return { ok: false as const, capability: selection.primary, status: "unavailable" as const, message: "No tenés permiso para usar esta capacidad en este proyecto." };
    }
    await guard(d, parsed.data.projectId, selection.requiredAction);

    const thread = await getOrCreateAgentThread(d, project.id);
    const previousMessages = await listAgentMessages(d, thread.id);
    const userMessage = await appendAgentUserMessage(d, thread.id, parsed.data.message);

    const [diagnoses, items, tasks, hypotheses, experiments, results, evidence, sessions, relations] = await Promise.all([
      d.repo.diagnoses.list({ projectId: project.id }),
      d.repo.diagnosisItems.list({ projectId: project.id }),
      d.repo.tasks.list({ projectId: project.id }),
      d.repo.hypotheses.list({ projectId: project.id }),
      d.repo.experiments.list({ projectId: project.id }),
      d.repo.experimentResults.list({ projectId: project.id }),
      d.repo.evidence.list({ projectId: project.id }),
      d.repo.mentorSessions.list({ projectId: project.id }),
      d.repo.mentorshipRelations.list({ projectId: project.id }),
    ]);
    const goals = (await Promise.all(relations.map((relation) => d.repo.mentorshipGoals.list({ relationId: relation.id })))).flat();
    const clip = (value: string | undefined, length: number) => value?.slice(0, length);
    const recentFirst = <T extends { updatedAt?: string; createdAt?: string }>(records: T[]) =>
      [...records].sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? "")).slice(0, 30);
    const recentMessages = previousMessages
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-12)
      .map((m) => ({
        author: m.author === "assistant" ? "RAX" : d.actor.name,
        content: m.content.slice(0, 1200),
        createdAt: m.createdAt,
      }));
    const request = {
      correlationId: d.newId("corr"),
      projectId: project.id,
      actor: { id: d.actor.id, role: d.actor.role, verified: true as const },
      messageId: userMessage.id,
      message: userMessage.content,
      workContext: {
        stage: parsed.data.stage,
        flowId: parsed.data.flowId,
        section: parsed.data.section,
        taskId: parsed.data.taskId,
        entityId: parsed.data.entityId,
        fieldPath: parsed.data.fieldPath,
        currentValue: parsed.data.currentValue,
        fieldSchema: parsed.data.fieldSchema,
      },
      context: {
        projectName: project.name,
        projectSummary: diagnoses[0]?.summary ?? project.description ?? null,
        recentMessages,
        currentItems: items
          .filter((item) => item.reviewStatus !== "rejected")
          .slice(0, 40)
          .map(({ id, category, title, content, infoType, reviewStatus, uncertainty }) => ({ id, category, title: title.slice(0, 160), content: content.slice(0, 900), infoType, reviewStatus, uncertainty })),
        relatedRecords: {
          tasks: recentFirst(tasks).map(({ id, title, status, actionType, dueDate, experimentId, goalId, blockedReason }) => ({ id, title: title.slice(0, 200), status, actionType, dueDate, experimentId, goalId, blockedReason: clip(blockedReason, 400) })),
          hypotheses: recentFirst(hypotheses).map(({ id, statement, segment, status, uncertainty }) => ({ id, statement: statement.slice(0, 700), segment: segment.slice(0, 200), status, uncertainty })),
          experiments: recentFirst(experiments).map(({ id, hypothesisId, question, method, metric, successCriterion, rejectionCriterion, status }) => ({ id, hypothesisId, question: question.slice(0, 500), method: method.slice(0, 500), metric: metric.slice(0, 200), successCriterion: successCriterion.slice(0, 400), rejectionCriterion: rejectionCriterion.slice(0, 400), status })),
          results: [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(({ id, experimentId, outcome, observed, metricValue, learnings, limitations }) => ({ id, experimentId, outcome, observed: observed.slice(0, 700), metricValue: metricValue.slice(0, 200), learnings: learnings.slice(0, 700), limitations: limitations.slice(0, 400) })),
          evidence: [...evidence].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30).map(({ id, kind, title, description }) => ({ id, kind, title: title.slice(0, 200), description: description.slice(0, 600) })),
          sessions: recentFirst(sessions).map(({ id, kind, status, scheduledAt }) => ({ id, kind, status, scheduledAt })),
          goals: recentFirst(goals).map(({ id, title, description, baseline, targetResult, status, priority }) => ({ id, title: title.slice(0, 200), description: description.slice(0, 500), baseline: baseline.slice(0, 300), targetResult: targetResult.slice(0, 300), status, priority })),
        },
        coveredDimensions: [],
        pendingDimensions: [],
        // No se incorpora ninguna nota de mentor al contexto del agente en esta versión.
        mentorNotes: [],
      },
    };
    let invocation;
    try {
      invocation = await invokeMainAgent(turn, request);
    } catch (err: unknown) {
      console.error("[main-agent] Excepción en invokeMainAgent:", err);
      invocation = {
        ok: false as const,
        capability: selection.primary,
        status: "unavailable" as const,
        message: "No se pudo completar la solicitud al agente.",
      };
    }

    if (!invocation.ok) {
      console.error(`[main-agent] Invocación no exitosa: status=${invocation.status}, capability=${invocation.capability}, message=${invocation.message}`);
    }

    if (invocation.ok) {
      const assistantMessage = await appendAgentAssistantMessage(d, thread.id, {
        content: invocation.reply,
        proposals: invocation.proposals as unknown as Array<Record<string, unknown>>,
      });
      return {
        ok: true as const,
        threadId: thread.id,
        userMessage,
        assistantMessage,
        reply: assistantMessage.content,
        proposals: invocation.proposals,
        capability: invocation.capability,
      };
    }

    // Persist only a safe, user-facing classification; never leak provider/network error details.
    const safeFailure = invocation.status === "disabled"
      ? { code: "agent_disabled", message: "El agente está deshabilitado mientras se completa la verificación de staging." }
      : invocation.status === "invalid"
        ? { code: "agent_context_invalid", message: "No se pudo validar el contexto de esta solicitud." }
        : { code: "agent_unavailable", message: "Esta capacidad no está disponible en este momento." };
    const assistantMessage = await appendAgentAssistantMessage(d, thread.id, {
      content: safeFailure.message,
      error: safeFailure,
    });
    return { ok: false as const, threadId: thread.id, userMessage, assistantMessage, capability: invocation.capability, status: invocation.status, message: safeFailure.message };
  });
}

/** Loads only the signed-in actor's agent thread for this authorized project. */
export async function loadMainAgentThreadAction(projectId: string) {
  return run(projectId, async (d) => {
    await guard(d, projectId, "agent.chat");
    const thread = await getAgentThread(d, projectId);
    if (!thread) return { thread: null, messages: [] };
    return { thread, messages: await listAgentMessages(d, thread.id) };
  });
}

/* ── Claude Projects: Hilos Múltiples, Conocimiento y Artefactos ── */

export async function listProjectThreadsAction(projectId: string) {
  return run(projectId, async (d) => {
    return listProjectThreads(d, projectId);
  });
}

export async function createProjectThreadAction(projectId: string, title?: string) {
  return run(projectId, async (d) => {
    return createAgentThread(d, projectId, title);
  });
}

export async function renameProjectThreadAction(projectId: string, threadId: string, title: string) {
  return run(projectId, async (d) => {
    return renameAgentThread(d, threadId, title);
  });
}

export async function loadThreadMessagesAction(projectId: string, threadId: string) {
  return run(projectId, async (d) => {
    const thread = await authorizedThread(d, threadId);
    const messages = await listAgentMessages(d, thread.id);
    return { thread, messages };
  });
}

export async function updateProjectInstructionsAction(projectId: string, instructions: string) {
  return run(projectId, async (d) => {
    return updateProjectInstructions(d, projectId, instructions);
  });
}

export async function listProjectDocumentsAction(projectId: string) {
  return run(projectId, async (d) => {
    return listProjectDocuments(d, projectId);
  });
}

export async function getProjectKnowledgeStatsAction(projectId: string) {
  return run(projectId, async (d) => {
    return getProjectKnowledgeStats(d, projectId);
  });
}

export async function addProjectDocumentAction(
  projectId: string,
  input: {
    title: string;
    filename: string;
    content: string;
    fileType?: ProjectDocumentFileType;
  },
) {
  return run(projectId, async (d) => {
    return addProjectDocument(d, projectId, input);
  });
}

export async function deleteProjectDocumentAction(projectId: string, documentId: string) {
  return run(projectId, async (d) => {
    return deleteProjectDocument(d, projectId, documentId);
  });
}

export async function promoteDecisionToKnowledgeAction(
  projectId: string,
  input: {
    title: string;
    filename?: string;
    content: string;
    messageId?: string;
  },
) {
  return run(projectId, async (d) => {
    return promoteDecisionToKnowledge(d, projectId, input);
  });
}

export async function sendClaudeAgentMessageAction(input: {
  projectId: string;
  threadId?: string;
  message: string;
  sessionContext?: SessionContext;
}) {
  return run(input.projectId, async (d) => {
    const { project } = await guard(d, input.projectId, "agent.chat");

    const thread = input.threadId
      ? await authorizedThread(d, input.threadId)
      : await getOrCreateAgentThread(d, project.id);

    const previousMessages = await listAgentMessages(d, thread.id);
    const userMessage = await appendAgentUserMessage(d, thread.id, input.message);

    // Recuperación de conocimiento híbrido (In-Context vs RAG automático)
    const knowledge = await getProjectKnowledgeContext(d.repo, project.id, input.message);

    // Historial del hilo aislado actual
    const history = previousMessages.map((m) => ({
      author: m.author,
      content: m.content,
    }));

    // Ejecución orquestada del agente
    const result = await executeClaudeAgentTurn({
      project,
      userMessage: input.message,
      history,
      knowledge,
      role: d.actor.role,
      deps: d,
      sessionContext: input.sessionContext,
    });

    const assistantMessage = await appendAgentAssistantMessage(d, thread.id, {
      content: result.reply,
      artifacts: result.artifacts,
      citations: result.citations,
      proposals: result.proposals,
    });

    return {
      threadId: thread.id,
      userMessage,
      assistantMessage,
      reply: assistantMessage.content,
      artifacts: result.artifacts,
      citations: result.citations,
      proposals: result.proposals,
      mode: result.mode,
      cachedPromptUsed: result.cachedPromptUsed ?? false,
      cacheStatus: result.cacheStatus ?? "simulated",
      cachedTokens: result.cachedTokens ?? 0,
    };
  });
}

/** Aplica una propuesta generada por el agente o workflow directamente en el proyecto con confirmación humana. */
export async function applyAiProposalAction(projectId: string, proposal: unknown) {
  const parsed = AiProposalItemSchema.safeParse(proposal);
  if (!parsed.success) return { ok: false as const, error: "La propuesta no tiene un formato válido." };

  return run(projectId, async (d) => {
    const item = parsed.data;

    if (item.type === "task") {
      const task = await createTask(d, projectId, {
        title: item.title,
        dueDate: undefined,
        actionType: item.actionType || "operational_task",
      });
      return { ok: true as const, type: "task" as const, id: task.id, title: task.title };
    }

    if (item.type === "hypothesis") {
      const hyp = await proposeHypothesis(d, projectId, {
        statement: item.title,
        segment: "General",
        whyItMatters: item.description || "Hipótesis sugerida para validación",
        currentEvidence: "Por verificar",
        costOfBeingWrong: "Riesgo de dedicar tiempo y recursos a un supuesto no comprobado",
        evaluationCriterion: "Validación ex-ante con clientes",
        uncertainty: "high",
      });
      return { ok: true as const, type: "hypothesis" as const, id: hyp.id, title: hyp.statement };
    }

    if (item.type === "experiment") {
      const existingHyps = await d.repo.hypotheses.list({ projectId });
      let hyp = existingHyps.find((h) => ["approved", "testing", "inconclusive", "supported", "weakened"].includes(h.status)) ?? existingHyps[0];
      if (!hyp) {
        hyp = await proposeHypothesis(d, projectId, {
          statement: item.title,
          segment: "General",
          whyItMatters: item.description || "Hipótesis sugerida para experimentación",
          currentEvidence: "Por comprobar",
          costOfBeingWrong: "Riesgo de dedicar tiempo y recursos a un supuesto no comprobado",
          evaluationCriterion: "Validación ex-ante con clientes",
          uncertainty: "high",
        });
      }
      const now = d.now();
      const expRow: Experiment = {
        id: d.newId("exp"),
        projectId,
        hypothesisId: hyp.id,
        question: item.title.slice(0, 500),
        method: (item.description || "Entrevistas de solución y preventa").slice(0, 500),
        participants: "15 prospectos calificados",
        activities: ["Contactar clientes potenciales", "Realizar entrevistas de validación", "Documentar cartas de intención"],
        resources: "Tiempo de fundadores",
        budget: 0,
        durationDays: 14,
        metric: "Tasa de conversión / intención de compra",
        successCriterion: ">= 20% de cartas de intención",
        rejectionCriterion: "< 5% de interés",
        risks: "Baja tasa de respuesta en frío",
        evidencePlan: "Citas textuales y cartas de intención firmadas",
        ownerId: d.actor.id,
        status: "design",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await d.repo.experiments.insert(expRow);
      return { ok: true as const, type: "experiment" as const, id: expRow.id, title: expRow.question };
    }

    if (item.type === "diagnosis_item") {
      const diag = await addItem(d, projectId, {
        category: (item.category as DiagnosisCategory) || "context",
        title: item.title,
        content: item.description || item.title,
        uncertainty: "medium",
      });
      // Si es una propuesta de contexto / resumen y el diagnóstico no tiene resumen previo,
      // actualizamos el resumen de diagnóstico para que pueda ser confirmado hacia la etapa de Orientar.
      if (
        (item.category === "context" || /s[ií]ntesis|resumen|contexto/i.test(item.title)) &&
        item.description &&
        item.description.length >= 10
      ) {
        const [dx] = await d.repo.diagnoses.list({ projectId });
        if (dx && (!dx.summary || !dx.summaryConfirmedAt)) {
          await editSummary(d, projectId, item.description.slice(0, 3000));
        }
      }
      return { ok: true as const, type: "diagnosis_item" as const, id: diag.id, title: diag.title };
    }

    if (item.type === "agenda_topic") {
      // El mentor lo guarda como pregunta en su próxima sesión; el emprendedor, como tarea para llevar a la sesión.
      if (d.actor.role === "mentor") {
        const sessions = await d.repo.mentorSessions.list({ projectId });
        const next = sessions
          .filter((s) => s.mentorId === d.actor.id && s.status !== "completed")
          .sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt))[0];
        if (!next) throw validation("Programa una sesión para guardar este tema en su agenda.");
        await guard(d, projectId, "mentor.note");
        // Se inserta sin addNote para no marcar como iniciada una sesión que todavía no ocurrió.
        const note = await d.repo.sessionNotes.insert({
          id: d.newId("note"),
          sessionId: next.id,
          projectId,
          authorId: d.actor.id,
          kind: "question",
          body: [item.title, item.description].filter(Boolean).join("\n").slice(0, 2000),
          isPrivate: false,
          createdAt: d.now(),
        });
        return { ok: true as const, type: "agenda_topic" as const, id: note.id, title: item.title };
      }
      const task = await createTask(d, projectId, { title: `Llevar a la sesión: ${item.title}`.slice(0, 300), dueDate: undefined, actionType: "research" });
      return { ok: true as const, type: "agenda_topic" as const, id: task.id, title: task.title };
    }

    if (item.type === "goal") {
      const task = await createTask(d, projectId, {
        title: item.title,
        dueDate: undefined,
        actionType: "operational_task",
      });
      return { ok: true as const, type: "goal" as const, id: task.id, title: task.title };
    }

    return { ok: true as const, type: item.type, title: item.title };
  });
}
