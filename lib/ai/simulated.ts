import { plainText } from "./plain-text";
import { NOTE_KIND_LABEL } from "@/features/labels";
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
  ExperimentTasksContext,
  ExperimentTasksResult,
  FirstReviewContext,
  FirstReviewResult,
  GoalsSuggestionContext,
  GoalsSuggestionResult,
  HypothesisSuggestionContext,
  HypothesesSuggestionResult,
  InterviewContext,
  PostSessionSynthesisContext,
  PostSessionSynthesisResult,
  PreSessionBriefingContext,
  PreSessionBriefingResult,
} from "./provider";
import type {
  AiProposal,
  AiTurn,
  GoalsSuggestion,
  PostSessionSynthesisSuggestion,
  PreSessionBriefingSuggestion,
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

    const agreement = `Investigar primero: «${targetProblem.slice(0, 160)}». Antes de avanzar con desarrollos técnicos o inversiones, el foco exclusivo del equipo debe estar en comprobar: ${priorityQuestion.slice(0, 180)}.`;

    const suggestedNotes: SuggestedNote[] = [];

    if (openQuestionItems.length > 0) {
      const q = openQuestionItems[0];
      suggestedNotes.push({
        kind: "question",
        body: `¿Quién es la persona o rol específico que hoy sufre este problema y qué alternativas manuales o de la competencia usa hoy?`,
        relatedItemId: q.id,
      });
    }

    if (assumptions.length > 0) {
      const asm = assumptions[0];
      suggestedNotes.push({
        kind: "observation",
        body: `Detectamos que «${asm.title}» es un supuesto crítico no contrastado empíricamente. Conviene no darlo por sentado.`,
        relatedItemId: asm.id,
      });
    }

    suggestedNotes.push({
      kind: "suggestion",
      body: "Recomendamos coordinar de 5 a 10 conversaciones breves de descubrimiento sin vender nada, solo escuchando cómo resuelven hoy esta dificultad.",
      relatedItemId: problemItems[0]?.id ?? null,
    });

    return {
      suggestion: {
        agreement,
        suggestedNotes: suggestedNotes.slice(0, 5),
      },
      provider: "simulated",
    };
  }

  async suggestHypotheses(ctx: HypothesisSuggestionContext): Promise<HypothesesSuggestionResult> {
    const pProb = ctx.prioritizedProblems[0];
    const targetTitle = pProb ? pProb.title : ctx.projectName;
    const targetId = pProb ? pProb.id : null;
    const segment =
      ctx.founderContext?.stage && ctx.founderContext?.sector
        ? `Clientes en etapa ${ctx.founderContext.stage} en el sector ${ctx.founderContext.sector}`
        : "Usuarios con el problema priorizado";

    const suggestions: SuggestedHypothesis[] = [];

    // Hipótesis 1: Conducta de dolor / necesidad
    suggestions.push({
      statement: `Al menos 7 de cada 10 entrevistados del segmento objetivo declararán que resolver "${targetTitle}" es una de sus tres principales prioridades operativas de este mes.`,
      segment,
      relatedItemId: targetId,
      whyItMatters: "Si el problema no está entre sus prioridades inmediatas, no dedicarán tiempo ni presupuesto a resolverlo.",
      currentEvidence: "Mencionado en las entrevistas iniciales de diagnóstico como punto crítico.",
      uncertainty: "high",
      costOfBeingWrong: "Diseñar una solución para una dificultad que los clientes consideran secundaria o postergable.",
      evaluationCriterion: "Respuestas directas registradas en una pauta estructurada de 10 entrevistas.",
      rationale: "Foco en confirmar la urgencia y prioridad real del dolor del cliente.",
    });

    // Hipótesis 2: Compromiso verificable / Disposición a pagar
    suggestions.push({
      statement: `Al menos 4 de 10 clientes potenciales que reconozcan el problema solicitarán formalmente participar en una prueba piloto no remunerada o firmarán una carta de interés.`,
      segment,
      relatedItemId: targetId,
      whyItMatters: "Verifica que el interés verbal se traduce en un compromiso concreto de tiempo y atención.",
      currentEvidence: "Aún no se cuenta con compromisos formales por escrito.",
      uncertainty: "high",
      costOfBeingWrong: "Construir producto asumiendo adopción que luego no se materializa.",
      evaluationCriterion: "Compromiso escrito u orden de trabajo provisoria al cierre de la conversación.",
      rationale: "Filtra el sesgo de cortesía habitual en las conversaciones iniciales.",
    });

    // Hipótesis 3 si hay supuestos clave
    if (ctx.keyAssumptions.length > 0) {
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

  async suggestExperimentTasks(ctx: ExperimentTasksContext): Promise<ExperimentTasksResult> {
    const exp = ctx.experiment;
    const existingTitles = new Set(ctx.existingTasks.map((t) => t.title.toLowerCase().trim()));
    const rawTasks: string[] = [];

    // Si el experimento tiene actividades definidas, las usamos como base directa
    if (exp.activities && exp.activities.length > 0) {
      for (const act of exp.activities) {
        const trimmed = act.trim();
        if (trimmed && !existingTitles.has(trimmed.toLowerCase())) {
          rawTasks.push(trimmed);
        }
      }
    }

    // Si aún quedan pocas tareas, generamos pasos derivados del contexto metodológico
    if (rawTasks.length < 3) {
      const candidates: string[] = [];

      if (exp.resources) {
        candidates.push(`Preparar materiales y herramientas: ${exp.resources.slice(0, 100)}`);
      } else {
        candidates.push(`Preparar guion e instrumentos para la prueba: ${exp.method.slice(0, 100)}`);
      }

      if (exp.participants) {
        candidates.push(`Contactar y reclutar participantes objetivo: ${exp.participants.slice(0, 100)}`);
      }

      candidates.push(`Conducir pruebas y registrar métrica: ${exp.metric.slice(0, 100)}`);

      if (exp.evidencePlan) {
        candidates.push(`Recopilar y documentar evidencia: ${exp.evidencePlan.slice(0, 100)}`);
      }

      candidates.push(`Tabular resultados observados y comparar contra criterios de éxito/rechazo`);

      for (const cand of candidates) {
        if (!existingTitles.has(cand.toLowerCase()) && !rawTasks.includes(cand)) {
          rawTasks.push(cand);
        }
      }
    }

    const tasks = (rawTasks.length > 0 ? rawTasks : ["Ejecutar las actividades planificadas del experimento", "Documentar los resultados observados"])
      .slice(0, 10)
      .map((t) => ({ title: t.slice(0, 200) }));

    return {
      suggestion: {
        tasks,
        rationale: `Tareas operativas organizadas para ejecutar el experimento de ${exp.method.slice(0, 60)}.`,
      },
      provider: "simulated",
    };
  }

  async suggestGoalsAndAgreement(ctx: GoalsSuggestionContext): Promise<GoalsSuggestionResult> {
    const pProb = ctx.prioritizedProblems[0];
    const problemText = pProb ? pProb.title : "propuesta de valor y demanda real";

    const suggestedGoals = [
      {
        title: "Validar con evidencia la propuesta de valor con clientes objetivo",
        description: `Conducir entrevistas en profundidad y pruebas cualitativas con al menos 10 clientes potenciales para verificar si «${problemText}» justifica el pago o adopción.`,
        whyItMatters: "Evita construir funcionalidades o invertir recursos antes de confirmar la disposición real a pagar.",
        kind: "qualitative" as const,
        baseline: "El diagnóstico cuenta con supuestos de validación temprana sin entrevistas estructuradas ni evidencia directa documentada.",
        targetResult: "10 entrevistas documentadas con al menos 6 clientes confirmando que el problema es prioritario y pagarían por resolverlo.",
        priority: "high" as const,
        rationale: "Alineado con el foco principal detectado en el diagnóstico inicial del proyecto.",
      },
      {
        title: "Estructurar métricas clave y tablero de seguimiento semanal",
        description: "Definir e implementar un sistema simple de registro para medir avance comercial, tiempo invertido y feedback de usuarios.",
        whyItMatters: "Permite tomar decisiones basadas en evidencia concreta y no en sensaciones subjetivas.",
        kind: "capability" as const,
        baseline: "No existe registro sistemático ni métricas formalizadas entre sesiones.",
        targetResult: "Tablero o planilla de métricas actualizado semanalmente con revisión compartida en cada sesión.",
        priority: "medium" as const,
        rationale: "Construye la capacidad analítica y la disciplina de gestión del equipo emprendedor.",
      },
      {
        title: "Lograr los primeros compromisos verificables de clientes",
        description: "Conseguir que clientes interesados manifiesten interés formal a través de cartas de intención, reservas o pagos piloto.",
        whyItMatters: "Es la prueba más contundente de tracción real y viabilidad comercial antes de escalar.",
        kind: "metric" as const,
        baseline: "0 clientes con compromiso formal o pago confirmado.",
        targetResult: "Al menos 3 compromisos verificables (cartas de intención firmadas o prepagos piloto).",
        metricIndicator: "Compromisos verificables firmados",
        priority: "high" as const,
        rationale: "Genera evidencia empírica contrastable para la siguiente etapa del negocio.",
      },
    ];

    const suggestedAgreementTerms = {
      frequency: "biweekly" as const,
      sessionDurationMinutes: 60,
      authorizedChannels: ["Google Meet", "WhatsApp"],
      scope: "Acompañamiento metodológico en validación de propuesta de valor, definición de experimentos, revisión de métricas y orientación estratégica. No incluye ejecución operativa directa ni asesoría legal o contable vinculante.",
      mentorCommitments: "Preparación previa de cada sesión revisando el tablero de RAX, puntualidad, devoluciones constructivas en un plazo menor a 48h y estricta confidencialidad.",
      entrepreneurCommitments: "Actualizar avances y bloqueos en la plataforma 24 horas antes de cada sesión, transparencia en métricas y cumplimiento riguroso de compromisos asumidos.",
      confidentialityTerms: "Confidencialidad recíproca respecto a métricas, información comercial, listados de clientes y propiedad intelectual.",
      expectedDurationWeeks: 12,
    };

    const suggestion: GoalsSuggestion = {
      suggestedGoals,
      suggestedAgreementTerms,
      rationale: "Propuesta equilibrada de 3 objetivos y términos de trabajo bilateral orientados a validar tracción y profesionalizar la toma de decisiones basada en evidencia.",
    };

    return {
      suggestion,
      provider: "simulated",
    };
  }

  async generatePreSessionBriefing(ctx: PreSessionBriefingContext): Promise<PreSessionBriefingResult> {
    const goalsSummary = ctx.goals.length
      ? ctx.goals.map((g) => `• [${g.status}] ${g.title} (Línea base: ${g.baseline} → Esperado: ${g.targetResult})`).join("\n")
      : "No hay objetivos formalizados todavía.";

    const agreementSummary = ctx.agreement
      ? `Acuerdo bilateral: Frecuencia ${ctx.agreement.frequency ?? "quincenal"}, alcance: ${ctx.agreement.scope ?? "acompañamiento estratégico"}.`
      : "Acuerdo bilateral pendiente de formalización.";

    const completed = ctx.recentCompletedTasks.length
      ? ctx.recentCompletedTasks.map((t) => `• ${t.title} (${t.actionType ?? "tarea"})`).join("\n")
      : ctx.diagnosisProblems?.length
      ? `Diagnóstico inicial estructurado (Etapa 1 · Entender):\n${ctx.diagnosisProblems.map((p) => `• [Problema] ${p.title}${p.isPrioritized ? " (PRIORIZADO)" : ""}`).join("\n")}`
      : "Sin tareas completadas recientemente.";

    const blocked = ctx.blockedOrDelayedTasks.length
      ? ctx.blockedOrDelayedTasks.map((t) => `• ${t.title}: ${t.delayCause ? `Causa: ${t.delayCause}${t.delayDetail ? ` (${t.delayDetail})` : ""}` : t.blockedReason ?? "demora informada"}`).join("\n")
      : ctx.diagnosisHypotheses?.length
      ? `Supuestos e hipótesis detectados:\n${ctx.diagnosisHypotheses.map((h) => `• ${h.title}`).join("\n")}`
      : "Sin bloqueos ni demoras reportadas.";

    const exps = ctx.experimentsInProgress.length
      ? ctx.experimentsInProgress.map((e) => `• Experimento en curso: ${e.question} (${e.metric ?? "métrica"})`).join("\n")
      : "";

    const recentProgressSummary = `Avances realizados:\n${completed}\n\nDificultades y bloqueos:\n${blocked}${exps ? `\n\nExperimentos:\n${exps}` : ""}`;

    // Capa 3 en secciones legibles: lo que quedó de la sesión anterior, incógnitas y lo que la persona planteó.
    const fromLastSession = [
      ...ctx.previousSessionNotes.map((n) => `• ${(NOTE_KIND_LABEL as Record<string, string>)[n.kind] ?? "Nota"}: ${plainText(n.body, 160)}`),
      ...(ctx.previousSessionPending ?? []).map((p) => `• ${p}`),
    ].slice(0, 6);
    const unknowns = (ctx.diagnosisUnknowns ?? []).slice(0, 4).map((u) => `• ${plainText(u.title, 120)}`);
    const asked = (ctx.recentMessages ?? []).slice(-3).map((m) => `• «${plainText(m.content, 180)}»`);
    const pendingTopicsSummary = [
      `De la sesión anterior:\n${fromLastSession.length ? fromLastSession.join("\n") : "• No quedaron notas ni compromisos registrados de una sesión anterior."}`,
      unknowns.length ? `Incógnitas del diagnóstico por aclarar:\n${unknowns.join("\n")}` : "",
      asked.length ? `Lo que la persona planteó recientemente en el chat:\n${asked.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const suggestedAgenda = [
      "1. Revisión de estado de ánimo, disponibilidad de tiempo y contexto general (5 min)",
      "2. Análisis de avances y causas explicativas de bloqueos o demoras (15 min)",
      "3. Discusión estratégica sobre el objetivo prioritario vigente (25 min)",
      "4. Definición y asignación de nuevos compromisos mutuos (15 min)",
    ];

    const suggestedQuestions = [
      "¿Qué fue lo más retador o inesperado que encontraste desde la última sesión?",
      "De los compromisos pendientes, ¿cuál destrabaría mayor valor si lo resolvemos primero?",
      "¿Qué apoyo específico o recurso clave necesitás de mi parte como mentor esta semana?",
    ];

    const briefing: PreSessionBriefingSuggestion = {
      activeAgreementsAndGoalsSummary: `${agreementSummary}\n\nObjetivos vigentes:\n${goalsSummary}`,
      recentProgressSummary,
      pendingTopicsSummary,
      suggestedAgenda,
      suggestedQuestions,
      rationale: "Briefing estructurado en 4 capas de memoria para preparación ágil de la sesión.",
    };

    return {
      briefing,
      provider: "simulated",
    };
  }

  async generatePostSessionSynthesis(ctx: PostSessionSynthesisContext): Promise<PostSessionSynthesisResult> {
    const agreementsAndDecisions = ctx.sessionNotes
      .filter((n) => n.kind === "agreement" || n.kind === "decision")
      .map((n) => n.body);

    // Sin IA, de la transcripción se rescatan las frases donde alguien se compromete a algo.
    const transcriptLines = (ctx.callTranscript ?? "").split("\n").filter((l) => /^\[\d/.test(l));
    const COMMIT = /\b(voy a|vamos a|me comprometo|quedamos en|qued[oó] en|para la pr[oó]xima|hay que|tengo que|tienes que|tenés que)\b/i;
    const transcriptCommitments = transcriptLines
      .map((l) => l.replace(/^\[[\d:]+\]\s*/, ""))
      .filter((l) => COMMIT.test(l))
      .slice(-6);

    const commitmentsNotes = [
      ...ctx.sessionNotes.filter((n) => n.kind === "commitment").map((n) => n.body),
      ...transcriptCommitments,
    ];

    const generalNotes = ctx.sessionNotes
      .filter((n) => !n.isPrivate)
      .map((n) => `[${n.kind}] ${n.body}`)
      .join("\n");

    const callExcerpt = transcriptLines.slice(0, 8).map((l) => l.replace(/^\[[\d:]+\]\s*/, "")).join("\n");
    const summary = ctx.sessionNotes.length || callExcerpt
      ? `Sesión enfocada en ${ctx.sessionKind}. Se revisaron avances, se destrabaron dificultades y se definieron los próximos pasos inmediatos.${generalNotes ? `\n\nPuntos tratados:\n${generalNotes.slice(0, 800)}` : ""}${callExcerpt ? `\n\nDe la llamada (${transcriptLines.length} intervenciones transcritas):\n${callExcerpt.slice(0, 800)}` : ""}`
      : `Sesión de ${ctx.sessionKind} completada exitosamente.`;

    const entrepreneurCommitments = commitmentsNotes.length
      ? commitmentsNotes.map((c) => ({
          title: c.slice(0, 180),
          actionType: "operational_task" as const,
        }))
      : [
          {
            title: "Ejecutar las acciones acordadas en la sesión",
            actionType: "operational_task" as const,
          },
        ];

    const mentorCommitments = [
      {
        title: "Revisar avances en la plataforma RAX antes del próximo encuentro",
      },
    ];

    const synthesis: PostSessionSynthesisSuggestion = {
      summary,
      agreedDecisions: agreementsAndDecisions.length ? agreementsAndDecisions : ["Continuar con el plan de acción acordado."],
      entrepreneurCommitments,
      mentorCommitments,
      nextSteps: "El emprendedor comenzará la ejecución de los compromisos asumidos; el mentor estará disponible para consultas asincrónicas.",
      suggestedNextSessionInDays: 14,
    };

    return {
      synthesis,
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
