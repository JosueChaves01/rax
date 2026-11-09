import type { IntakeCoverage } from "@/types/b2b";
import { getIntakeView, recordIntakeAnswer, submitIntake } from "@/lib/services/intake";
import type { B2BTool } from "../types";
import { FINISH_INTAKE_TOOL, RECORD_INTAKE_ANSWER_TOOL } from "./definitions";

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

export const CLIENT_TOOLS: B2BTool[] = [recordIntakeAnswerTool, finishIntakeTool];
