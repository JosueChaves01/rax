import type { IntakeCoverage, PublishedResource } from "@/types/b2b";
import { isDomainError } from "@/lib/errors";
import { buildMentorContext } from "@/lib/ai/mentor-context";
import { getIntakeView, recordIntakeAnswer, submitIntake } from "@/lib/services/intake";
import { getPublishedResource, listPublishedResources } from "@/lib/services/client-portal";
import { listAssessments } from "@/lib/services/assessments";
import { getCycleOverview } from "@/lib/services/cycle";
import { sysRepo } from "@/lib/services/base";
import type { B2BTool, B2BToolResult } from "../types";
import { EXPLAIN_RESOURCE_TOOL, FINISH_INTAKE_TOOL, PREPARE_FOR_SESSION_TOOL, RECORD_INTAKE_ANSWER_TOOL } from "./definitions";

/**
 * Herramientas del agente del cliente y del entrevistador de intake (Dev B). Previstas:
 * record_intake_answer, finish_intake, explain_resource y prepare_for_session. El asistente del
 * cliente solo usa material publicado y el RAG del mentor filtrado en el servidor.
 * Solo se ofrecen con RAX_B2B_FLOW encendida.
 */

const COVERAGE: IntakeCoverage[] = ["answered", "partial", "skipped"];

const recordIntakeAnswerTool: B2BTool = {
  definition: RECORD_INTAKE_ANSWER_TOOL,
  status: "Anotando tu respuesta…",
  async run(ctx, args) {
    const questionId = typeof args.question_id === "string" ? args.question_id : "";
    const status = COVERAGE.find((c) => c === args.status);
    if (!questionId || !status) return { summary: "Falta question_id o un status válido (answered, partial o skipped).", proposals: [] };
    const state = await recordIntakeAnswer(ctx.deps, ctx.project.id, questionId, status);
    const covered = Object.keys(state.coverage).length;
    return { summary: `Quedó registrada la pregunta ${questionId} como ${status}. Preguntas con respuesta: ${covered}.`, proposals: [], data: { coverage: state.coverage } };
  },
};

const finishIntakeTool: B2BTool = {
  definition: FINISH_INTAKE_TOOL,
  status: "Revisando tu entrevista…",
  async run(ctx, args) {
    if (args.confirmed === true) {
      await submitIntake(ctx.deps, ctx.project.id);
      return { summary: "La entrevista se envió al mentor. Su resumen le llega para preparar la Sesión 1.", proposals: [], data: { submitted: true } };
    }
    const view = await getIntakeView(ctx.deps, ctx.project.id);
    const covered = (s: IntakeCoverage | undefined) => s === "answered" || s === "skipped";
    const pending = view.guide.filter((q) => q.required && !covered(view.state.coverage[q.id]));
    return {
      summary: pending.length
        ? `Faltan ${pending.length} pregunta(s) obligatoria(s): ${pending.map((q) => q.question).join(" · ")}`
        : "Ya no quedan preguntas obligatorias. La persona puede tocar «Enviar a mi mentor» (o pedirte que la envíes).",
      proposals: [],
      data: { status: view.state.status, pendingRequired: pending.map((q) => q.id) },
    };
  },
};

/* ───────────── Asistente del cliente (Fase 4) ───────────── */

/** El resultado de una herramienta se recorta a ~6000 caracteres: el material y el contexto se reparten eso. */
const RESOURCE_CHARS = 3500;
const MENTOR_CONTEXT_CHARS = 1500;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Si la persona no tiene acceso (no es cliente del proyecto), se responde sin romper el turno. */
async function safely(run: () => Promise<B2BToolResult>): Promise<B2BToolResult> {
  try {
    return await run();
  } catch (e) {
    if (isDomainError(e)) return { summary: e.message, proposals: [], data: { error: e.code } };
    throw e;
  }
}

const resourceLine = (r: PublishedResource) => ({ id: r.documentId, title: r.title, kind: r.docKind, publishedAt: r.publishedAt.slice(0, 10) });

const explainResourceTool: B2BTool = {
  definition: EXPLAIN_RESOURCE_TOOL,
  status: "Leyendo el material de tu mentor…",
  run: (ctx, args) =>
    safely(async () => {
      const resources = await listPublishedResources(ctx.deps, ctx.project.id);
      const id = str(args.document_id);
      const title = fold(str(args.title));
      const match = id
        ? resources.find((r) => r.documentId === id)
        : title
          ? resources.find((r) => fold(r.title) === title) ?? resources.find((r) => fold(r.title).includes(title))
          : resources.length === 1
            ? resources[0]
            : undefined;
      if (!match) {
        return {
          summary: resources.length
            ? `${id || title ? "No encontré ese material entre lo publicado. " : ""}Tu mentor publicó ${resources.length} material(es); pregúntale a la persona cuál quiere entender.`
            : "Tu mentor todavía no publicó material en este proyecto.",
          proposals: [],
          data: { resources: resources.slice(0, 20).map(resourceLine) },
        };
      }
      const { content, project } = await getPublishedResource(ctx.deps, ctx.project.id, match.documentId);
      const question = str(args.question);
      const mentor = project.mentorId
        ? await buildMentorContext(sysRepo(ctx.deps), project.mentorId, `${match.title} ${question}`.trim()).catch(() => ({ text: "", citations: [] }))
        : { text: "", citations: [] };
      return {
        summary: `Leí «${match.title}». Explícaselo a la persona con palabras simples, apoyándote en el método de su mentor, sin inventar lo que el material no dice.`,
        proposals: [],
        data: {
          resource: resourceLine(match),
          ...(question ? { question } : {}),
          content: clip(content, RESOURCE_CHARS),
          truncated: content.length > RESOURCE_CHARS,
          ...(mentor.text ? { mentorContext: clip(mentor.text, MENTOR_CONTEXT_CHARS) } : {}),
        },
      };
    }),
};

const prepareForSessionTool: B2BTool = {
  definition: PREPARE_FOR_SESSION_TOOL,
  status: "Preparando tu próxima sesión…",
  run: (ctx) =>
    safely(async () => {
      const [overview, assessments, resources] = await Promise.all([
        getCycleOverview(ctx.deps, ctx.project.id),
        listAssessments(ctx.deps, ctx.project.id),
        listPublishedResources(ctx.deps, ctx.project.id),
      ]);
      const next = overview.nextSession;
      const commitments = overview.commitments.filter((c) => c.status !== "done" && (overview.viewer === "mentor" || c.assigneeId === ctx.deps.actor.id));
      const pending = assessments.filter((a) => a.assessment.status === "published" && (!a.mine || a.mine.status === "draft"));
      const parts = [
        next
          ? `Próxima sesión: ${next.number ? `Sesión ${next.number}` : next.kind === "kickoff" ? "Sesión 1" : "seguimiento"}${next.scheduledAt ? ` el ${next.scheduledAt.slice(0, 16).replace("T", " ")}` : " (todavía sin fecha)"} con ${next.agenda.length} tema(s).`
          : "No hay una sesión próxima agendada.",
        `${commitments.length} compromiso(s) pendiente(s).`,
        `${pending.length} evaluación(es) por responder.`,
      ];
      return {
        summary: parts.join(" "),
        proposals: [],
        data: {
          nextSession: next
            ? {
                id: next.id,
                number: next.number,
                kind: next.kind,
                scheduledAt: next.scheduledAt ?? null,
                agenda: next.agenda.map((t) => ({ title: t.title, goal: clip(t.goal, 300), status: t.status })),
              }
            : null,
          lastSession: overview.latestSynthesis ? { summary: clip(overview.latestSynthesis.summary, 600), nextSteps: clip(overview.latestSynthesis.nextSteps ?? "", 400) } : null,
          commitments: commitments.slice(0, 15).map((c) => ({ title: c.title, status: c.status, dueDate: c.dueDate ?? null })),
          pendingAssessments: pending.slice(0, 10).map((a) => ({ id: a.assessment.id, title: a.assessment.title, dueAt: a.assessment.dueAt ?? null, draftSaved: a.mine?.status === "draft" })),
          recentMaterial: resources.slice(0, 5).map(resourceLine),
        },
      };
    }),
};

export const CLIENT_TOOLS: B2BTool[] = [recordIntakeAnswerTool, finishIntakeTool, explainResourceTool, prepareForSessionTool];
