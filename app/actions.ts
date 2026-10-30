"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type {
  Comment,
  DiagnosisCategory,
  EvidenceKind,
  InfoType,
  InitiativeNature,
  MentorDecision,
  MentorSessionKind,
  ProjectStatus,
  ResultOutcome,
  SessionNoteKind,
  TaskStatus,
  MilestoneStatus,
  CompatibilityStatus,
  GoalStatus,
  MentorshipStage,
  Uncertainty,
} from "@/types/domain";
import { getDeps, homeFor } from "@/lib/runtime";
import { createUserClient } from "@/lib/supabase/server";
import { appUrl, missingConfig } from "@/lib/supabase/config";
import { completeOnboarding } from "@/lib/services/onboarding";
import { isDomainError } from "@/lib/errors";
import type { ServiceDeps } from "@/lib/services/base";
import type { ItemChange } from "@/features/diagnosis/rules";
import { createProject, setConversationSharing, setProjectStatus } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
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
import { invokeSyncChatN8n, dispatchEventToN8n } from "@/lib/n8n/dispatcher";
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
  return run(projectId, async (d) => {
    const r = await sendMessage(d, V.parse(V.Ids, projectId), V.parse(V.Text(8000), content));
    return r.ok ? { aiError: null, proposals: r.proposalsCreated, summaryDrafted: r.summaryDrafted } : { aiError: r.aiError, proposals: 0, summaryDrafted: false };
  });
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
    return generatePreSessionBriefing(d, V.parse(V.Ids, sessionId));
  });

export const generatePostSessionSynthesisAction = async (projectId: string, sessionId: string) =>
  run(projectId, async (d) => {
    return generatePostSessionSynthesis(d, V.parse(V.Ids, sessionId));
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
    await dispatchEventToN8n({
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
    return true;
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
}) => {
  const d = await getDeps();
  if (!d) return { ok: false as const, error: "Inicia sesión para pedir una sugerencia de IA." };

  const prompt = `Sugiere una reformulación breve de la conclusión usando el Principio de la Pirámide de Minto.\nTítulo: ${input.title}\nConclusión actual: ${input.conclusion}\nArgumentos actuales: ${input.argumentsText}\nDatos y evidencia aportados: ${input.dataText}\n\nNo inventes cifras, clientes, resultados, fuentes ni evidencia. Si faltan datos, no los completes. Devuelve solo la conclusión sugerida y cualquier incertidumbre relevante.`;

  try {
    const chatRes = await invokeSyncChatN8n({
      correlationId: d.newId("doc_opt"),
      projectId: "doc_preview",
      messageId: d.newId("msg"),
      message: prompt,
      actor: { id: d.actor.id, role: d.actor.role, verified: true },
      context: {
        projectName: "Documentos",
        projectSummary: "Optimización de documento con pirámide de Minto",
        recentMessages: [],
        currentItems: [],
        coveredDimensions: [],
        pendingDimensions: [],
        mentorNotes: [],
      },
    });
    const reply = chatRes.response?.reply?.trim();
    if (!chatRes.ok || !reply) {
      return { ok: false as const, error: chatRes.error || "La IA no devolvió una sugerencia válida." };
    }
    return { ok: true as const, reply };
  } catch {
    return { ok: false as const, error: "No se pudo conectar con el servicio de IA." };
  }
};

export const evaluateExerciseAction = async (exerciseText: string) => {
  const d = await getDeps();
  if (!d) return { ok: false as const, error: "Inicia sesión para evaluar tu ejercicio." };
  const validatedExercise = V.parse(V.Text(4000), exerciseText.trim());
  if (!validatedExercise) return { ok: false as const, error: "Escribe una respuesta antes de evaluarla." };
  const prompt = `Evalúa esta respuesta usando el marco PREP:\nObjeción: «Tu servicio parece caro frente a alternativas de software gratuitas».\nRespuesta del emprendedor:\n"${validatedExercise}"\n\nAnaliza el Punto, la Razón, el Ejemplo y el Punto final. No asumas que las cifras o casos son ciertos: señala que no puedes verificarlos. Devuelve una calificación explícita sobre 10 y hasta tres frases de retroalimentación constructiva.`;

  try {
    const chatRes = await invokeSyncChatN8n({
      correlationId: d.newId("eval_prep"),
      projectId: "prep_eval",
      messageId: d.newId("msg"),
      message: prompt,
      actor: { id: d.actor.id, role: d.actor.role, verified: true },
      context: {
        projectName: "Aprendizaje Aplicado",
        projectSummary: "Evaluación de ejercicio PREP de objeciones comerciales",
        recentMessages: [],
        currentItems: [],
        coveredDimensions: [],
        pendingDimensions: [],
        mentorNotes: [],
      },
    });

    const reply = chatRes.response?.reply || "";
    const scoreMatch = reply.match(/(\d+)\s*\/\s*10/);
    if (!chatRes.ok || !scoreMatch) {
      return { ok: false as const, error: chatRes.error || "La IA no devolvió una evaluación con puntaje válido." };
    }

    return {
      ok: true as const,
      score: `${scoreMatch[1]}/10`,
      feedback: reply,
    };
  } catch {
    return { ok: false as const, error: "No se pudo conectar con el servicio de IA." };
  }
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
  if (rel) {
    const now = d.now();
    await d.repo.mentorshipRelations.update(rel.id, {
      compatibilityStatus: "proceed",
      compatibilityRationale: `Motivación: ${input.motivation}. Descripción: ${input.description}`,
      stage: "diagnosis",
      updatedAt: now,
    });
    await dispatchEventToN8n({
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
  }

  return { ok: true, notice: "Exploración y compatibilidad registradas exitosamente con n8n." };
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

/* ── Chat Contextual Síncrono con n8n (RAX-02) ── */

export async function sendN8nChatAction(
  message: string,
  history: Array<{ sender: "user" | "ai" | "mentor"; text: string }> = []
): Promise<
  | { ok: true; reply: string; chips: string[]; provider: "n8n" }
  | { ok: false; error: string }
> {
  const d = await getDeps();
  if (!d) return { ok: false, error: "Inicia sesión para usar el chat." };

  const correlationId = d.newId("corr");
  const recentMessages = history.slice(-6).map((m) => ({
    author: m.sender === "user" ? d.actor.name : "RAX AI",
    content: m.text,
    createdAt: new Date().toISOString(),
  }));

  // 1. Invocar n8n síncrono (RAX-02)
  try {
    const n8nRes = await invokeSyncChatN8n({
      message: message.trim(),
      correlationId,
      projectId: "global",
      messageId: d.newId("msg"),
      actor: {
        id: d.actor.id,
        role: d.actor.role,
        verified: true,
      },
      context: {
        projectName: "RAX Innovation",
        projectSummary: "Validación de modelo y acompañamiento",
        recentMessages,
        currentItems: [],
        coveredDimensions: [],
        pendingDimensions: [],
        mentorNotes: [],
      },
    });

    if (n8nRes.ok && n8nRes.response?.reply?.trim()) {
      const reply = n8nRes.response.reply;
      const chips =
        n8nRes.response.proposals && n8nRes.response.proposals.length > 0
          ? n8nRes.response.proposals.map((p) => p.title).slice(0, 4)
          : ["Generar plantilla con IA", "Ver ejemplo práctico", "Consultar a mi mentor"];

      return { ok: true, reply, chips, provider: "n8n" };
    }
    return { ok: false, error: n8nRes.error || "El servicio de chat no devolvió una respuesta." };
  } catch (err: unknown) {
    console.warn("[n8n-chat] Falló la solicitud:", err);
    return { ok: false, error: "No se pudo conectar con el servicio de chat." };
  }
}
