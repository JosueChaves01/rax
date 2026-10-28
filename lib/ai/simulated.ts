import {
  DIMENSION_CATEGORY,
  DIMENSION_QUESTION,
  DIMENSION_TITLE,
  isUnknownSentence,
  readStatementSignal,
  splitSentences,
} from "@/features/conversation/interview";
import type { InterviewDimension } from "@/types/domain";
import type { AiProvider, AiResult, FirstReviewContext, FirstReviewResult, InterviewContext } from "./provider";
import type { AiProposal, AiTurn, SuggestedNote } from "./schema";

const MAX_QUOTE = 280;

/**
 * Proveedor SIMULADO. No usa ningún modelo: aplica reglas deterministas.
 * - Archiva la respuesta literal del emprendedor en la dimensión que se le preguntó (nunca inventa contenido).
 * - Clasifica cómo lo dijo ("no sé" → desconocido, "supongo" → supuesto) con readStatementSignal.
 * - Pregunta la siguiente dimensión pendiente, una a la vez.
 * - Cuando hay contexto suficiente, arma un borrador de resumen concatenando lo que la persona dijo.
 * Sus mensajes se marcan provider="simulated" y la UI lo declara visiblemente.
 */
export class SimulatedProvider implements AiProvider {
  readonly id = "simulated" as const;
  readonly label = "Simulación (sin modelo de IA conectado)";

  async interpret(ctx: InterviewContext): Promise<AiResult> {
    const asked = lastAskedDimension(ctx);
    const text = ctx.latestMessage.content.trim();
    const signal = readStatementSignal(text);
    const proposals: AiProposal[] = [];

    if (asked && text) {
      // Agrupa oraciones consecutivas: las que expresan "no sé" van a preguntas abiertas,
      // el resto se archiva en la dimensión preguntada. Cada propuesta cita su texto literal.
      const runs: Array<{ unknown: boolean; text: string }> = [];
      for (const sentence of splitSentences(text)) {
        const unknown = isUnknownSentence(sentence);
        const last = runs[runs.length - 1];
        if (last && last.unknown === unknown) last.text += ` ${sentence}`;
        else runs.push({ unknown, text: sentence });
      }
      for (const run of runs) {
        const quote = run.text.length > MAX_QUOTE ? `${run.text.slice(0, MAX_QUOTE)}…` : run.text;
        const kind = readStatementSignal(run.text);
        proposals.push({
          op: "create",
          targetItemId: null,
          category: run.unknown ? "open_question" : DIMENSION_CATEGORY[asked],
          title: run.unknown ? `Pendiente: ${DIMENSION_TITLE[asked].toLowerCase()}` : DIMENSION_TITLE[asked],
          content: quote,
          infoType: run.unknown
            ? "unknown"
            : kind.kind === "assumption"
              ? "hypothesis"
              : kind.kind === "observation"
                ? "documented_observation"
                : "entrepreneur_statement",
          uncertainty: run.unknown ? "unknown" : kind.uncertainty,
          sourceMessageId: ctx.latestMessage.id,
          quote,
          reason: run.unknown
            ? "La persona indicó que todavía no lo sabe; queda registrado como pregunta abierta."
            : `Respuesta a la pregunta sobre ${DIMENSION_TITLE[asked].toLowerCase()}.`,
        });
      }
    }

    const covered = new Set<InterviewDimension>(ctx.coveredDimensions);
    if (asked) covered.add(asked);
    const next = ctx.pendingDimensions.find((d) => !covered.has(d)) ?? null;

    const enough = covered.has("problem") && covered.has("people") && covered.size >= 4;
    const summaryDraft = enough && !ctx.projectSummary ? draftSummary(ctx, proposals) : null;

    let reply: string;
    if (signal.changeOfMind) {
      reply = "Entendido, actualizo el enfoque sin borrar lo anterior: queda en el historial. ";
    } else if (isUnknownSentence(text)) {
      reply = "No pasa nada por no saberlo todavía: lo dejo registrado como pregunta abierta. ";
    } else {
      reply = "";
    }
    if (summaryDraft) {
      reply +=
        "Ya tengo una primera lectura y te preparé un resumen en el panel de diagnóstico: ¿esto representa lo que querés hacer o hay algo que debemos corregir?";
      if (next) reply += ` Mientras lo revisás, sigamos: ${DIMENSION_QUESTION[next]}`;
    } else if (next) {
      reply += DIMENSION_QUESTION[next];
    } else {
      reply += "Cubrimos las preguntas iniciales. Podés seguir contándome detalles o revisar el diagnóstico.";
    }

    const turn: AiTurn = {
      reply,
      askedDimension: next,
      proposals,
      contradictions: [],
      summaryDraft,
    };
    return { turn, provider: "simulated" };
  }

  async suggestFirstReview(ctx: FirstReviewContext): Promise<FirstReviewResult> {
    const mainProblem = ctx.briefing.mainProblem || "Validar la necesidad principal del cliente";
    const openQuestionItems = ctx.items.filter((i) => i.infoType === "unknown" || i.category === "open_question");
    const assumptions = ctx.items.filter((i) => i.infoType === "hypothesis" || i.uncertainty === "high");
    const problemItems = ctx.items.filter((i) => i.category === "problem");

    const targetProblem = problemItems[0]?.content ?? mainProblem;
    const priorityQuestion = openQuestionItems[0]?.content ?? "quién es el pagador real y cuánto está dispuesto a pagar";
    const missingEvidence = assumptions[0]?.content ?? "evidencia directa de clientes experimentando el problema";

    const agreement = `Investigar primero el problema central: "${targetProblem}". Priorizar responder: "${priorityQuestion}". Falta validar con evidencia: "${missingEvidence}".`;

    const suggestedNotes: SuggestedNote[] = [];

    if (openQuestionItems[0]) {
      suggestedNotes.push({
        kind: "question",
        body: `¿Cómo podemos responder a corto plazo la incógnita sobre "${openQuestionItems[0].title}" sin requerir inversión previa?`,
        relatedItemId: openQuestionItems[0].id,
      });
    }

    if (assumptions[0]) {
      suggestedNotes.push({
        kind: "observation",
        body: `Se identificó el supuesto crítico: "${assumptions[0].content}". Requiere comprobarse antes de diseñar experimentos costosos.`,
        relatedItemId: assumptions[0].id,
      });
    }

    if (problemItems[0]) {
      suggestedNotes.push({
        kind: "suggestion",
        body: `Realizar al menos 5 entrevistas de descubrimiento enfocadas exclusivamente en "${problemItems[0].title}", evitando proponer soluciones prematuras.`,
        relatedItemId: problemItems[0].id,
      });
    } else {
      suggestedNotes.push({
        kind: "suggestion",
        body: "Iniciar entrevistas de descubrimiento con potenciales usuarios para caracterizar la frecuencia y gravedad del problema.",
        relatedItemId: null,
      });
    }

    return {
      suggestion: {
        agreement: agreement.slice(0, 2000),
        suggestedNotes,
      },
      provider: "simulated",
    };
  }
}

function lastAskedDimension(ctx: InterviewContext): InterviewDimension | undefined {
  for (let i = ctx.recentMessages.length - 1; i >= 0; i--) {
    const m = ctx.recentMessages[i];
    if (m.author === "assistant") return m.dimension;
    if (m.author === "entrepreneur") return undefined;
  }
  return undefined;
}

function draftSummary(ctx: InterviewContext, fresh: AiProposal[]): string {
  const pick = (title: string) =>
    [...ctx.currentItems.map((i) => ({ title: i.title, content: i.content })), ...fresh].find((i) => i.title === title)?.content;
  const parts = [
    pick(DIMENSION_TITLE.nature) && `Iniciativa: ${pick(DIMENSION_TITLE.nature)}`,
    pick(DIMENSION_TITLE.people) && `Personas: ${pick(DIMENSION_TITLE.people)}`,
    pick(DIMENSION_TITLE.problem) && `Problema percibido: ${pick(DIMENSION_TITLE.problem)}`,
    pick(DIMENSION_TITLE.origin) && `Origen: ${pick(DIMENSION_TITLE.origin)}`,
  ].filter(Boolean);
  return `${parts.join("\n")}\n\n(Borrador armado con tus propias palabras por la simulación; editalo si algo no te representa.)`;
}
