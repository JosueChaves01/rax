import { z } from "zod";
import type { Id, Project } from "@/types/domain";
import type { Assessment, AssessmentAnswer, AssessmentInput, AssessmentQuestion, AssessmentSubmission, ProjectMode } from "@/types/b2b";
import { can } from "@/lib/authz";
import { conflict, notFound, validation } from "@/lib/errors";
import { audit, relationOf, sysRepo, type ServiceDeps } from "./base";
import { notify } from "./notifications";

/**
 * Evaluaciones (exámenes) que el mentor crea y el cliente responde. Reemplazan a hipótesis y
 * experimentos (congelados). Dueño: Dev B (plan técnico §2.4 y §6.1).
 *
 * - El mentor del proyecto crea, edita (solo en borrador), publica y cierra; revisa cada entrega con
 *   puntaje y comentario.
 * - Cada persona cliente ve solo lo publicado o cerrado, guarda un borrador y envía UNA entrega por
 *   evaluación (unique assessment_id + client_id). En proyectos grupales hay una entrega por persona y
 *   el mentor ve además la vista agregada (promedio y dispersión).
 * - Se lee y escribe con el repositorio del sistema DESPUÉS de comprobar la relación con el proyecto
 *   (mismo criterio que RLS: el cliente nunca ve borradores ni entregas ajenas).
 */

export const ASSESSMENT_LIMITS = {
  title: 200,
  instructions: 8000,
  questions: 30,
  prompt: 1000,
  options: 10,
  option: 200,
  openAnswer: 5000,
  feedback: 8000,
} as const;

/** Escala de las preguntas «scale»: 1 a 5. Las opciones, si hay, son las etiquetas de los extremos. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

const questionSchema = z
  .object({
    id: z.string().trim().max(60).optional(),
    kind: z.enum(["open", "single_choice", "multi_choice", "scale"], { message: "Tipo de pregunta no válido." }),
    prompt: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, "Cada pregunta necesita un enunciado.").max(ASSESSMENT_LIMITS.prompt, `Cada enunciado admite hasta ${ASSESSMENT_LIMITS.prompt} caracteres.`)),
    options: z
      .array(z.string().transform((s) => s.trim()).pipe(z.string().max(ASSESSMENT_LIMITS.option, `Cada opción admite hasta ${ASSESSMENT_LIMITS.option} caracteres.`)))
      .max(ASSESSMENT_LIMITS.options, `Cada pregunta admite hasta ${ASSESSMENT_LIMITS.options} opciones.`)
      .optional(),
    points: z.number().finite().min(0).max(100).optional(),
  })
  .transform((q) => ({ ...q, options: q.options?.filter(Boolean) }))
  .superRefine((q, ctx) => {
    if (q.kind === "single_choice" || q.kind === "multi_choice") {
      const opts = q.options ?? [];
      if (opts.length < 2) ctx.addIssue({ code: "custom", message: `«${q.prompt.slice(0, 60)}» necesita al menos dos opciones.` });
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) ctx.addIssue({ code: "custom", message: `«${q.prompt.slice(0, 60)}» tiene opciones repetidas.` });
    }
  });

const inputSchema = z.object({
  title: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Ponle un título a la evaluación.").max(ASSESSMENT_LIMITS.title, `El título admite hasta ${ASSESSMENT_LIMITS.title} caracteres.`)),
  instructions: z
    .string()
    .default("")
    .transform((s) => s.trim())
    .pipe(z.string().max(ASSESSMENT_LIMITS.instructions, `Las instrucciones admiten hasta ${ASSESSMENT_LIMITS.instructions} caracteres.`)),
  questions: z.array(questionSchema).max(ASSESSMENT_LIMITS.questions, `Una evaluación admite hasta ${ASSESSMENT_LIMITS.questions} preguntas.`),
  sessionId: z.string().trim().optional(),
  dueAt: z.string().trim().optional(),
});

function parseInput(input: unknown) {
  const r = inputSchema.safeParse(input);
  if (!r.success) throw validation(r.error.issues[0]?.message ?? "Revisa los datos de la evaluación.");
  return r.data;
}

function cleanQuestions(d: ServiceDeps, raw: ReturnType<typeof parseInput>["questions"]): AssessmentQuestion[] {
  const seen = new Set<string>();
  return raw.map((q) => {
    let id = q.id && !seen.has(q.id) ? q.id : d.newId("aq");
    while (seen.has(id)) id = d.newId("aq");
    seen.add(id);
    return {
      id,
      kind: q.kind,
      prompt: q.prompt,
      ...(q.kind === "open" ? {} : q.options?.length ? { options: q.kind === "scale" ? q.options.slice(0, 2) : q.options } : {}),
      ...(typeof q.points === "number" ? { points: q.points } : {}),
    };
  });
}

function parseDue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw.length === 10 ? `${raw}T23:59:00` : raw);
  if (Number.isNaN(t)) throw validation("La fecha límite no es válida.");
  return new Date(t).toISOString();
}

/* ───────────── Acceso ───────────── */

type Viewer = "mentor" | "client";

async function projectAccess(d: ServiceDeps, projectId: Id): Promise<{ project: Project; viewer: Viewer }> {
  const project = await sysRepo(d).projects.get(projectId);
  const rel = await relationOf(d, projectId);
  const viewer: Viewer | null =
    project?.mentorId && rel.isProjectMentor && can(d.actor, "assessment.manage", rel)
      ? "mentor"
      : project?.mentorId && rel.isClient && can(d.actor, "resource.read", rel)
        ? "client"
        : null;
  if (!project || !viewer) {
    if (project) await audit(d, "access.denied", { projectId, meta: { action: "assessment" } });
    throw notFound("Este proyecto no existe o no tienes acceso.");
  }
  return { project, viewer };
}

async function asMentor(d: ServiceDeps, projectId: Id): Promise<Project> {
  const { project, viewer } = await projectAccess(d, projectId);
  if (viewer !== "mentor") throw notFound("Esta evaluación no existe o no tienes acceso.");
  return project;
}

/** La evaluación (que el cliente solo ve publicada o cerrada) y quién la mira. */
async function loadAssessment(d: ServiceDeps, id: Id): Promise<{ assessment: Assessment; project: Project; viewer: Viewer }> {
  const assessment = await sysRepo(d).assessments.get(id);
  if (!assessment) throw notFound("Esta evaluación no existe o no tienes acceso.");
  const { project, viewer } = await projectAccess(d, assessment.projectId);
  if (viewer === "client" && assessment.status === "draft") throw notFound("Esta evaluación no existe o no tienes acceso.");
  return { assessment, project, viewer };
}

async function clientIds(d: ServiceDeps, projectId: Id): Promise<Id[]> {
  const members = await sysRepo(d).projectMembers.list({ projectId, role: "client" });
  return [...new Set(members.filter((m) => m.role === "client").map((m) => m.profileId))];
}

async function validSessionId(d: ServiceDeps, projectId: Id, sessionId: string | undefined): Promise<Id | undefined> {
  if (!sessionId) return undefined;
  const s = await sysRepo(d).mentorSessions.get(sessionId);
  if (!s || s.projectId !== projectId) throw validation("La sesión indicada no es de este proyecto.");
  return s.id;
}

/* ───────────── Mentor: crear, editar, publicar, cerrar ───────────── */

export async function createAssessment(d: ServiceDeps, projectId: Id, input: AssessmentInput): Promise<Assessment> {
  await asMentor(d, projectId);
  const data = parseInput(input);
  const row: Assessment = {
    id: d.newId("asm"),
    projectId,
    createdBy: d.actor.id,
    title: data.title,
    instructions: data.instructions,
    questions: cleanQuestions(d, data.questions),
    status: "draft",
    createdAt: d.now(),
  };
  const sessionId = await validSessionId(d, projectId, data.sessionId);
  const dueAt = parseDue(data.dueAt);
  return sysRepo(d).assessments.insert({ ...row, ...(sessionId ? { sessionId } : {}), ...(dueAt ? { dueAt } : {}) });
}

/** Edita una evaluación en borrador (publicada ya no: las personas pudieron empezar a responder). */
export async function updateAssessment(d: ServiceDeps, id: Id, input: AssessmentInput): Promise<Assessment> {
  const { assessment, viewer } = await loadAssessment(d, id);
  if (viewer !== "mentor") throw notFound("Esta evaluación no existe o no tienes acceso.");
  if (assessment.status !== "draft") throw validation("Solo se edita una evaluación en borrador.");
  const data = parseInput(input);
  const sessionId = await validSessionId(d, assessment.projectId, data.sessionId);
  const dueAt = parseDue(data.dueAt);
  return sysRepo(d).assessments.update(id, {
    title: data.title,
    instructions: data.instructions,
    questions: cleanQuestions(d, data.questions),
    sessionId,
    dueAt,
  });
}

/** Publica (borrador → publicada) y avisa a cada persona cliente. Repetirlo no vuelve a avisar. */
export async function publishAssessment(d: ServiceDeps, id: Id): Promise<Assessment> {
  const { assessment, project, viewer } = await loadAssessment(d, id);
  if (viewer !== "mentor") throw notFound("Esta evaluación no existe o no tienes acceso.");
  if (assessment.status === "published") return assessment;
  if (assessment.status === "closed") throw validation("La evaluación ya está cerrada.");
  if (assessment.questions.length === 0) throw validation("Agrega al menos una pregunta antes de publicar.");
  const saved = await sysRepo(d).assessments.update(id, { status: "published", publishedAt: d.now() });
  for (const clientId of await clientIds(d, project.id)) {
    await notify(d, clientId, "assessment_published", {
      projectId: project.id,
      assessmentId: id,
      title: saved.title,
      projectName: project.name,
      ...(saved.dueAt ? { dueAt: saved.dueAt } : {}),
    });
  }
  return saved;
}

/** Cierra una evaluación publicada: ya no recibe entregas; las que hay se pueden seguir revisando. */
export async function closeAssessment(d: ServiceDeps, id: Id): Promise<Assessment> {
  const { assessment, viewer } = await loadAssessment(d, id);
  if (viewer !== "mentor") throw notFound("Esta evaluación no existe o no tienes acceso.");
  if (assessment.status === "closed") return assessment;
  if (assessment.status !== "published") throw validation("Solo se cierra una evaluación publicada.");
  return sysRepo(d).assessments.update(id, { status: "closed" });
}

/* ───────────── Lectura ───────────── */

export interface AssessmentListItem {
  assessment: Assessment;
  /** Mentor: entregas enviadas o revisadas y cuántas ya revisó. */
  submitted: number;
  reviewed: number;
  /** Personas cliente del proyecto. */
  clients: number;
  /** Cliente: su entrega (estado y, si ya la revisó el mentor, el puntaje). */
  mine?: { status: AssessmentSubmission["status"]; score?: number };
}

/** Evaluaciones del proyecto: el mentor ve todas; la persona cliente, las publicadas o cerradas. */
export async function listAssessments(d: ServiceDeps, projectId: Id): Promise<AssessmentListItem[]> {
  const { viewer } = await projectAccess(d, projectId);
  const sys = sysRepo(d);
  const [all, clients] = await Promise.all([sys.assessments.list({ projectId }), clientIds(d, projectId)]);
  const visible = all.filter((a) => a.projectId === projectId && (viewer === "mentor" || a.status !== "draft"));
  const items = await Promise.all(
    visible.map(async (assessment): Promise<AssessmentListItem> => {
      const subs = await sys.assessmentSubmissions.list({ assessmentId: assessment.id });
      const sent = subs.filter((s) => s.status !== "draft");
      const own = subs.find((s) => s.clientId === d.actor.id);
      return {
        assessment,
        submitted: viewer === "mentor" ? sent.length : 0,
        reviewed: viewer === "mentor" ? sent.filter((s) => s.status === "reviewed").length : 0,
        clients: clients.length,
        ...(viewer === "client" && own ? { mine: { status: own.status, ...(own.status === "reviewed" && typeof own.score === "number" ? { score: own.score } : {}) } } : {}),
      };
    }),
  );
  const rank = (a: Assessment) => (a.status === "published" ? 0 : a.status === "draft" ? 1 : 2);
  return items.sort(
    (x, y) => rank(x.assessment) - rank(y.assessment) || (y.assessment.publishedAt ?? y.assessment.createdAt).localeCompare(x.assessment.publishedAt ?? x.assessment.createdAt),
  );
}

export interface QuestionAggregate {
  questionId: string;
  kind: AssessmentQuestion["kind"];
  prompt: string;
  /** Cuántas entregas la respondieron. */
  answered: number;
  /** Escala: promedio, dispersión (desviación estándar), mínimo y máximo. */
  average?: number;
  spread?: number;
  min?: number;
  max?: number;
  /** Opción múltiple: cuántas personas eligieron cada opción. */
  options?: Array<{ option: string; count: number }>;
}

export interface AssessmentAggregate {
  /** Entregas enviadas o revisadas / personas cliente. */
  submissions: number;
  clients: number;
  /** Puntaje de las entregas revisadas con puntaje. */
  score?: { average: number; spread: number; min: number; max: number; count: number };
  questions: QuestionAggregate[];
}

export interface SubmissionView extends AssessmentSubmission {
  clientName: string;
}

export interface AssessmentView {
  assessment: Assessment;
  viewer: Viewer;
  mode: ProjectMode;
  /** Cliente: su entrega (borrador, enviada o revisada). */
  mySubmission?: AssessmentSubmission;
  /** Mentor: las entregas enviadas o revisadas, con el nombre de cada persona. */
  submissions?: SubmissionView[];
  /** Mentor: personas que todavía no enviaron. */
  pending?: Array<{ id: Id; name: string }>;
  /** Mentor de un proyecto grupal: promedio y dispersión. */
  aggregate?: AssessmentAggregate;
}

const round = (n: number) => Math.round(n * 100) / 100;

function stats(values: number[]): { average: number; spread: number; min: number; max: number } | undefined {
  if (!values.length) return undefined;
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.sqrt(values.reduce((a, b) => a + (b - average) ** 2, 0) / values.length);
  return { average: round(average), spread: round(spread), min: Math.min(...values), max: Math.max(...values) };
}

/** Vista agregada de las entregas enviadas: por pregunta (escala y opciones) y el puntaje general. */
export function aggregateSubmissions(assessment: Assessment, submissions: AssessmentSubmission[], clients: number): AssessmentAggregate {
  const sent = submissions.filter((s) => s.status !== "draft");
  const scores = sent.filter((s) => s.status === "reviewed" && typeof s.score === "number").map((s) => s.score!);
  const score = stats(scores);
  return {
    submissions: sent.length,
    clients,
    ...(score ? { score: { ...score, count: scores.length } } : {}),
    questions: assessment.questions.map((q) => {
      const values = sent.map((s) => s.answers.find((a) => a.questionId === q.id)?.value).filter((v) => isAnswered(q, v));
      const base: QuestionAggregate = { questionId: q.id, kind: q.kind, prompt: q.prompt, answered: values.length };
      if (q.kind === "scale") return { ...base, ...(stats(values.map(Number)) ?? {}) };
      if (q.kind === "single_choice" || q.kind === "multi_choice") {
        const picked = values.flatMap((v) => (Array.isArray(v) ? v : [String(v)]));
        return { ...base, options: (q.options ?? []).map((option) => ({ option, count: picked.filter((p) => p === option).length })) };
      }
      return base;
    }),
  };
}

/** Una evaluación con lo que le toca ver a quien consulta. */
export async function getAssessment(d: ServiceDeps, id: Id): Promise<AssessmentView> {
  const { assessment, project, viewer } = await loadAssessment(d, id);
  const sys = sysRepo(d);
  const mode = project.mode ?? "individual";
  const subs = (await sys.assessmentSubmissions.list({ assessmentId: id })).filter((s) => s.assessmentId === id);
  if (viewer === "client") {
    const mine = subs.find((s) => s.clientId === d.actor.id);
    return { assessment, viewer, mode, ...(mine ? { mySubmission: clientCopy(mine) } : {}) };
  }
  const clients = await clientIds(d, project.id);
  const names = new Map<Id, string>();
  await Promise.all(
    [...new Set([...clients, ...subs.map((s) => s.clientId)])].map(async (pid) => {
      const p = await sys.profiles.get(pid).catch(() => undefined);
      names.set(pid, p?.name || "Persona cliente");
    }),
  );
  const sent = subs.filter((s) => s.status !== "draft").sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt));
  const sentBy = new Set(sent.map((s) => s.clientId));
  return {
    assessment,
    viewer,
    mode,
    submissions: sent.map((s) => ({ ...s, clientName: names.get(s.clientId) ?? "Persona cliente" })),
    pending: clients.filter((c) => !sentBy.has(c)).map((c) => ({ id: c, name: names.get(c) ?? "Persona cliente" })),
    ...(mode === "group" ? { aggregate: aggregateSubmissions(assessment, subs, clients.length) } : {}),
  };
}

/** El cliente ve puntaje y comentario solo cuando el mentor ya revisó. */
function clientCopy(s: AssessmentSubmission): AssessmentSubmission {
  if (s.status === "reviewed") return s;
  const { score: _score, mentorFeedback: _feedback, ...rest } = s;
  void _score;
  void _feedback;
  return rest;
}

/* ───────────── Cliente: responder ───────────── */

function isAnswered(q: AssessmentQuestion, v: AssessmentAnswer["value"] | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (q.kind === "multi_choice") return Array.isArray(v) && v.length > 0;
  if (q.kind === "scale") return typeof v === "number";
  return typeof v === "string" && v.trim() !== "";
}

/** Valida y normaliza las respuestas contra las preguntas. Ignora preguntas que no existen. */
export function normalizeAnswers(questions: AssessmentQuestion[], raw: unknown): AssessmentAnswer[] {
  if (!Array.isArray(raw)) throw validation("Las respuestas no tienen el formato esperado.");
  const out: AssessmentAnswer[] = [];
  for (const q of questions) {
    const item = raw.find((a): a is { questionId: string; value: unknown } => !!a && typeof a === "object" && (a as { questionId?: unknown }).questionId === q.id);
    if (!item || item.value === undefined || item.value === null) continue;
    const v = item.value;
    const label = `«${q.prompt.slice(0, 60)}»`;
    switch (q.kind) {
      case "open": {
        if (typeof v !== "string") throw validation(`La respuesta a ${label} debe ser un texto.`);
        const text = v.trim();
        if (text.length > ASSESSMENT_LIMITS.openAnswer) throw validation(`La respuesta a ${label} admite hasta ${ASSESSMENT_LIMITS.openAnswer} caracteres.`);
        if (text) out.push({ questionId: q.id, value: text });
        break;
      }
      case "single_choice": {
        if (typeof v !== "string") throw validation(`Elige una opción en ${label}.`);
        if (v === "") break;
        if (!(q.options ?? []).includes(v)) throw validation(`La opción elegida en ${label} no existe.`);
        out.push({ questionId: q.id, value: v });
        break;
      }
      case "multi_choice": {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw validation(`Las opciones de ${label} no son válidas.`);
        const picked = [...new Set(v as string[])];
        if (picked.some((x) => !(q.options ?? []).includes(x))) throw validation(`Alguna opción elegida en ${label} no existe.`);
        if (picked.length) out.push({ questionId: q.id, value: (q.options ?? []).filter((o) => picked.includes(o)) });
        break;
      }
      case "scale": {
        const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
        if (typeof n !== "number" || !Number.isInteger(n) || n < SCALE_MIN || n > SCALE_MAX) throw validation(`En ${label} elige un valor de ${SCALE_MIN} a ${SCALE_MAX}.`);
        out.push({ questionId: q.id, value: n });
        break;
      }
    }
  }
  return out;
}

/**
 * La persona cliente guarda su borrador (`draft: true`) o envía su entrega (por defecto). Una sola
 * entrega por persona: después de enviarla ya no se cambia. Al enviar se exige responder todo y se
 * avisa al mentor.
 */
export async function submitAssessment(d: ServiceDeps, id: Id, answers: AssessmentAnswer[], opts: { draft?: boolean } = {}): Promise<AssessmentSubmission> {
  const { assessment, project, viewer } = await loadAssessment(d, id);
  if (viewer !== "client") throw notFound("Esta evaluación no existe o no tienes acceso.");
  if (assessment.status !== "published") throw validation("Esta evaluación ya está cerrada.");
  const clean = normalizeAnswers(assessment.questions, answers);
  const sys = sysRepo(d);
  const existing = (await sys.assessmentSubmissions.list({ assessmentId: id, clientId: d.actor.id })).find((s) => s.clientId === d.actor.id && s.assessmentId === id);
  if (existing && existing.status !== "draft") throw conflict("Ya enviaste esta evaluación.");
  const final = !opts.draft;
  if (final) {
    const missing = assessment.questions.filter((q) => !clean.some((a) => a.questionId === q.id));
    if (missing.length) throw validation(`Te falta responder ${missing.length === 1 ? "una pregunta" : `${missing.length} preguntas`}: ${missing.map((q) => `«${q.prompt.slice(0, 60)}»`).join(", ")}.`);
  }
  const now = d.now();
  const patch = { answers: clean, status: final ? ("submitted" as const) : ("draft" as const), ...(final ? { submittedAt: now } : {}) };
  const saved = existing
    ? await sys.assessmentSubmissions.update(existing.id, patch)
    : await sys.assessmentSubmissions.insert({ id: d.newId("asub"), assessmentId: id, clientId: d.actor.id, createdAt: now, ...patch });
  if (final && project.mentorId) {
    await notify(d, project.mentorId, "assessment_submitted", {
      projectId: project.id,
      assessmentId: id,
      submissionId: saved.id,
      title: assessment.title,
      clientName: d.actor.name,
      projectName: project.name,
    });
  }
  return clientCopy(saved);
}

/* ───────────── Mentor: revisar ───────────── */

export async function reviewSubmission(d: ServiceDeps, submissionId: Id, input: { score?: number; feedback: string }): Promise<AssessmentSubmission> {
  const sys = sysRepo(d);
  const submission = await sys.assessmentSubmissions.get(submissionId);
  if (!submission) throw notFound("Esta entrega no existe o no tienes acceso.");
  const { assessment, project, viewer } = await loadAssessment(d, submission.assessmentId);
  if (viewer !== "mentor") throw notFound("Esta entrega no existe o no tienes acceso.");
  if (submission.status === "draft") throw validation("La persona todavía no envió esta evaluación.");
  const feedback = (input.feedback ?? "").trim();
  if (feedback.length > ASSESSMENT_LIMITS.feedback) throw validation(`El comentario admite hasta ${ASSESSMENT_LIMITS.feedback} caracteres.`);
  const score = input.score === undefined || input.score === null || (typeof input.score === "number" && Number.isNaN(input.score)) ? undefined : input.score;
  if (score !== undefined && (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1000)) throw validation("El puntaje debe ser un número entre 0 y 1000.");
  if (!feedback && score === undefined) throw validation("Escribe un comentario o pon un puntaje.");
  const saved = await sys.assessmentSubmissions.update(submissionId, {
    status: "reviewed",
    mentorFeedback: feedback || undefined,
    score,
    reviewedAt: d.now(),
  });
  await notify(d, submission.clientId, "assessment_reviewed", {
    projectId: project.id,
    assessmentId: assessment.id,
    submissionId,
    title: assessment.title,
    projectName: project.name,
    ...(score !== undefined ? { score } : {}),
  });
  return saved;
}
