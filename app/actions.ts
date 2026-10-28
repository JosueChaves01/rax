"use server";

import { cookies } from "next/headers";
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
  Uncertainty,
} from "@/types/domain";
import { DEMO_SESSION_COOKIE, getDeps, getRepository } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import type { ServiceDeps } from "@/lib/services/base";
import type { ItemChange } from "@/features/diagnosis/rules";
import { createProject, setConversationSharing, setProjectStatus } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { addComment, addItem, changeItem, confirmSummary, editSummary } from "@/lib/services/diagnosis";
import { addNote, completeFirstReview, completeSecondReview, requestReview, startSession } from "@/lib/services/mentoring";
import {
  addEvidence,
  approveHypothesis,
  createExperiment,
  createTask,
  discardHypothesis,
  markExperimentReady,
  proposeHypothesis,
  recordResult,
  reformulateHypothesis,
  returnHypothesis,
  setTaskStatus,
  startExperiment,
  submitHypothesis,
  updateExperiment,
  type ExperimentInput,
  type HypothesisInput,
} from "@/lib/services/validation";
import { assignMentor, revokeMentor } from "@/lib/services/admin";
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

/* ── Sesión DEMO ── */

export async function enterAsDemo(profileId: string) {
  const repo = await getRepository();
  const profile = await repo.profiles.get(profileId);
  if (!profile) return;
  (await cookies()).set(DEMO_SESSION_COOKIE, profile.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  redirect(profile.role === "admin" ? "/app/admin" : "/app");
}

export async function leaveDemo() {
  (await cookies()).delete(DEMO_SESSION_COOKIE);
  redirect("/entrar");
}

/* ── Proyectos ── */

export async function createProjectAction(input: { name: string; description: string; nature: InitiativeNature }) {
  const res = await run(null, (d) => createProject(d, V.parse(V.NewProject, input)));
  if (res.ok && res.data) redirect(`/app/p/${res.data.id}`);
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
export const addNoteAction = async (projectId: string, sessionId: string, kind: SessionNoteKind, body: string, relatedItemId?: string) =>
  run(projectId, async (d) => {
    await addNote(d, V.parse(V.Ids, sessionId), V.parse(V.NoteKind, kind), V.parse(V.Text(2000), body), relatedItemId ? V.parse(V.Ids, relatedItemId) : undefined);
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
export const createTaskAction = async (projectId: string, input: { title: string; experimentId?: string; dueDate?: string }) =>
  run(projectId, async (d) => {
    await createTask(d, V.parse(V.Ids, projectId), V.parse(V.TaskInput, input));
  });
export const setTaskStatusAction = async (projectId: string, taskId: string, status: TaskStatus) =>
  run(projectId, async (d) => {
    await setTaskStatus(d, V.parse(V.Ids, taskId), V.parse(V.TaskStatus, status));
  });

/* ── Administración ── */

export const assignMentorAction = async (projectId: string, mentorId: string) =>
  run(null, async (d) => {
    await assignMentor(d, V.parse(V.Ids, projectId), V.parse(V.Ids, mentorId));
  });
export const revokeMentorAction = async (assignmentId: string) =>
  run(null, async (d) => {
    await revokeMentor(d, V.parse(V.Ids, assignmentId));
  });
