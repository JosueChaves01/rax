import {
  DIMENSION_CATEGORY,
  DIMENSION_QUESTION,
  DIMENSION_TITLE,
  isUnknownSentence,
  readStatementSignal,
  splitSentences,
} from "@/features/conversation/interview";
import type { InterviewDimension } from "@/types/domain";
import type {
  AiProvider,
  AiResult,
  ExperimentSuggestionContext,
  ExperimentSuggestionResult,
  FirstReviewContext,
  FirstReviewResult,
  HypothesisSuggestionContext,
  HypothesesSuggestionResult,
  InterviewContext,
} from "./provider";
import type {
  AiProposal,
  AiTurn,
  SuggestedExperiment,
  SuggestedHypothesis,
  SuggestedNote,
} from "./schema";

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
          reason: `Registrado a partir de la respuesta sobre ${DIMENSION_TITLE[asked].toLowerCase()}.`,
        });
      }
    }

    const next = ctx.pendingDimensions[0];
    const summaryDraft = ctx.summaryReady && !ctx.projectSummary ? draftSummary(ctx, proposals) : null;

    let reply = "";
    if (signal.kind === "unknown") {
      reply = "Entendido, lo dejamos registrado como incógnita a explorar. ";
    } else if (signal.kind === "assumption") {
      reply = "Queda anotado como un supuesto a comprobar. ";
    }

    if (summaryDraft) {
      reply += "Con lo que me contaste armé un borrador inicial del diagnóstico. ¿Esto representa lo que querés hacer o hay algo que debemos corregir?";
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

  async suggestHypotheses(ctx: HypothesisSuggestionContext): Promise<HypothesesSuggestionResult> {
    const targetProblem = ctx.prioritizedProblems[0] ?? ctx.otherProblems[0];
    const targetTitle = targetProblem?.title ?? ctx.projectName;
    const segment = ctx.founderContext?.sector
      ? `Clientes y usuarios potenciales en el sector ${ctx.founderContext.sector}`
      : "Personas afectadas directamente por el problema identificado";

    const suggestions: SuggestedHypothesis[] = [
      {
        statement: `Al menos 6 de cada 15 personas del segmento objetivo contactadas confirmarán que experimentan "${targetTitle}" semanalmente y agendarán una sesión de demostración.`,
        segment,
        relatedItemId: targetProblem?.id ?? null,
        whyItMatters: "Permite comprobar empíricamente la frecuencia y severidad del problema antes de construir una solución.",
        currentEvidence: "Declaraciones y observaciones registradas durante la etapa inicial de diagnóstico.",
        uncertainty: "high",
        costOfBeingWrong: "Invertir tiempo y recursos en resolver una situación que los clientes no perciben como prioritaria.",
        evaluationCriterion: "Alcanzar al menos un 40% de conversiones a entrevistas o pilotos demostrativos.",
        rationale: "Basada en el problema priorizado para validar la demanda real antes de desarrollar producto.",
      },
      {
        statement: `Al menos 4 de 12 clientes potenciales que sufren "${targetTitle}" manifestarán disposición explícita a pagar un abono periódico por resolverlo.`,
        segment: "Decisores económicos y responsables de presupuesto",
        relatedItemId: targetProblem?.id ?? null,
        whyItMatters: "Verifica si existe viabilidad comercial y disposición de pago real frente al costo de oportunidad.",
        currentEvidence: "No hay evidencia transaccional previa ni acuerdos de pago registrados.",
        uncertainty: "high",
        costOfBeingWrong: "Diseñar una solución que resulta atractiva pero por la cual nadie tiene presupuesto para pagar.",
        evaluationCriterion: "Obtener al menos un 30% de cartas de intención o pre-reservas comerciales.",
        rationale: "Permite contrastar la hipótesis de modelo comercial temprano.",
      },
    ];

    if (ctx.keyAssumptions[0]) {
      const asm = ctx.keyAssumptions[0];
      suggestions.push({
        statement: `Al menos el 50% de los usuarios evaluados considerará que "${asm.title}" es un factor indispensable para sustituir su alternativa actual.`,
        segment,
        relatedItemId: asm.id,
        whyItMatters: "Comprueba el supuesto más crítico e incierto registrado en el diagnóstico.",
        currentEvidence: "Mencionado como supuesto por el equipo emprendedor sin validación directa.",
        uncertainty: "high",
        costOfBeingWrong: "Construir la propuesta de valor sobre una premisa no contrastada.",
        evaluationCriterion: "Mayoría simple de respuestas afirmativas en pruebas de concepto estructuradas.",
        rationale: "Aborda el supuesto con mayor incertidumbre detectado en la investigación.",
      });
    }

    return {
      suggestion: {
        suggestions,
        contextSummary: `Sugerencias estructuradas sobre el problema "${targetTitle}".`,
      },
      provider: "simulated",
    };
  }

  async suggestExperiment(ctx: ExperimentSuggestionContext): Promise<ExperimentSuggestionResult> {
    const hyp = ctx.hypothesis;
    const segment = hyp.segment || "Usuarios potenciales del segmento objetivo";

    const suggestion: SuggestedExperiment = {
      question: `¿Al menos 5 de cada 15 participantes del segmento «${segment}» confirmarán la necesidad y agendarán una prueba piloto?`,
      method: "Entrevistas estructuradas de descubrimiento con presentación de prototipo interactivo o flujo visual.",
      participants: `15 participantes calificados del segmento: ${segment}.`,
      activities: [
        "Reclutar a 15 candidatos activos y representativos del segmento definido.",
        "Conducir entrevistas individuales semiestructuradas de 30 minutos explorando sus hábitos actuales.",
        "Presentar el concepto clave o flujo prototipado sin inducir respuestas positivas.",
        "Solicitar un compromiso observable al finalizar la sesión (carta de intención o agendamiento de piloto).",
        "Documentar aprendizajes y tabular resultados objetivos.",
      ],
      resources: "Guía de entrevista estandarizada, prototipo visual interactivo, planilla de registro de respuestas.",
      budget: 0,
      durationDays: 10,
      metric: "Cantidad y porcentaje de participantes que realizan una acción concreta de compromiso formal.",
      successCriterion: "Al menos 5 de los 15 participantes (≥33%) asumen un compromiso verificable.",
      rejectionCriterion: "Menos de 2 participantes (<15%) demuestran interés en coordinar un siguiente paso.",
      risks: "Sesgo de cortesía por parte de los entrevistados; dificultad para coordinar agendas dentro de la ventana de tiempo.",
      evidencePlan: "Grabaciones o notas de las entrevistas, formulario de registro y confirmaciones por correo o mensaje.",
      rationale: "Diseño pragmático, rápido y sin costo monetario para validar la hipótesis antes de programar o invertir capital.",
    };

    return {
      suggestion,
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
