import "server-only";
import type { AgentArtifact, KnowledgeCitation, Project } from "@/types/domain";
import type { KnowledgeContextResult } from "./knowledge-retrieval";
import { extractArtifacts } from "./artifact-parser";
import type { ServiceDeps } from "@/lib/services/base";
import { executeWorkflowTool, makeProposal, RAX_WORKFLOW_TOOLS } from "./workflow-tools";
import type { AiProposalItem } from "@/lib/n8n/contracts";

export interface SessionContext {
  location?: "project_conversation" | "global_assistant" | "diagnosis" | "tasks" | "mentorship_session" | "agreements" | "evaluation";
  pageTitle?: string;
  stage?: string;
  isMentorView?: boolean;
}

export interface ClaudeTurnInput {
  project: Project;
  userMessage: string;
  history: Array<{ author: "user" | "assistant"; content: string }>;
  knowledge: KnowledgeContextResult;
  role: "entrepreneur" | "mentor" | "admin";
  deps?: ServiceDeps;
  sessionContext?: SessionContext;
}

export type CacheStatus = "hit" | "write" | "unsupported" | "simulated" | "miss";

export interface ClaudeTurnResult {
  reply: string;
  artifacts: AgentArtifact[];
  citations: KnowledgeCitation[];
  proposals: Array<Record<string, unknown>>;
  mode: "in_context" | "rag";
  cachedPromptUsed?: boolean;
  cacheStatus?: CacheStatus;
  cachedTokens?: number;
}

export function buildSystemPrompt(
  project: Project,
  knowledge: KnowledgeContextResult,
  role: "entrepreneur" | "mentor" | "admin" = "entrepreneur",
  sessionContext?: SessionContext,
): string {
  let knowledgeBlock = "";

  if (knowledge.mode === "in_context" && knowledge.inContextDocs && knowledge.inContextDocs.length > 0) {
    const docsXml = knowledge.inContextDocs
      .map(
        (doc, idx) => `  <document index="${idx + 1}" filename="${doc.filename}" title="${doc.title}">
${doc.content}
  </document>`,
      )
      .join("\n\n");
    knowledgeBlock = `<project_knowledge mode="in_context" count="${knowledge.inContextDocs.length}">
${docsXml}
</project_knowledge>`;
  } else if (knowledge.mode === "rag" && knowledge.retrievedChunks && knowledge.retrievedChunks.length > 0) {
    const chunksXml = knowledge.retrievedChunks
      .map(
        (item, idx) => `  <passage index="${idx + 1}" source="${item.document.filename}" title="${item.document.title}" chunk="${item.chunk.chunkIndex}">
${item.chunk.content}
  </passage>`,
      )
      .join("\n\n");
    knowledgeBlock = `<project_knowledge mode="rag" status="retrieved_relevant_passages">
${chunksXml}
</project_knowledge>`;
  } else {
    knowledgeBlock = `<project_knowledge status="empty">
  No hay documentos cargados en la base de conocimientos de este proyecto aún.
</project_knowledge>`;
  }

  const customInstructions = project.customInstructions?.trim()
    ? project.customInstructions.trim()
    : "Sin instrucciones adicionales. Mantén un tono honesto, empático y pedagógico, adaptándote activamente según el usuario sea un estudiante/aprendiz guiado por un mentor o tutor, o alguien estructurando una iniciativa de negocio.";

  const projectExt = project as Project & { archetype?: string; sector?: string; stage?: string; summary?: string };
  const isLearningProject =
    projectExt.archetype === "learning" ||
    Boolean(projectExt.sector?.toLowerCase().includes("educa")) ||
    /aprend|estudi|react|curso|tutor|programaci[oó]n|javascript|python|materia|clase|universidad|colegio|escuela|formaci[oó]n/i.test(project.name) ||
    /aprend|estudi|curso|tutor|formaci[oó]n/i.test(project.description || projectExt.summary || "");

  const currentStage = sessionContext?.stage || projectExt.stage || "entender";
  const currentLocation = sessionContext?.location === "project_conversation"
    ? `Conversación de trabajo del proyecto «${project.name}» (/app/p/.../conversacion)`
    : sessionContext?.pageTitle || "Plataforma RAX";

  return `Eres el Agente Inteligente de RAX, diseñado bajo la arquitectura de Claude Projects.
Operas como un orquestador de contexto persistente, herramientas y conocimiento compartido para el proyecto actual.

<current_session_and_location>
- Proyecto actual: "${project.name}" (ID: ${project.id})
- Sector / Categoría: ${projectExt.sector || (isLearningProject ? "Educación y Formación" : "General")}
- Arquetipo: ${projectExt.archetype || (isLearningProject ? "learning" : "general")}
- Etapa del proyecto: ${currentStage} (fase actual de trabajo)
- Ubicación / Sesión actual en la plataforma: ${currentLocation}
- Rol del usuario actual: ${role === "mentor" ? "Mentor / Tutor" : "Estudiante / Aprendiz / Emprendedor"}
${project.description || projectExt.summary ? `- Resumen del proyecto: "${project.description || projectExt.summary}"` : ""}
</current_session_and_location>

Tu rol es dual y se adapta a las necesidades y objetivos de la persona:
- Como copiloto para **mentores, tutores y estudiantes**: apoyas procesos de aprendizaje, comprensión conceptual profunda, resolución de dudas académicas y formativas, desarrollo de habilidades y preparación de sesiones de tutoría.
- Como copiloto para **asesores y emprendedores**: apoyas la estructuración de iniciativas de negocio, diagnóstico metodológico riguroso y contraste empírico cuando corresponda.

Reglas fundamentales:
1. Honestidad visible: separa lo confirmado de las suposiciones y no inventes cifras, hechos ni aprobaciones.
2. Si te preguntan por información contenida en el conocimiento del proyecto, cíñete a los documentos y cita el nombre del archivo.
3. No compartes información con otros proyectos ni mezclas historiales de otros hilos.
4. **Regla de oro contra el sesgo de validación comercial**:
   Si el proyecto actual es de aprendizaje (como «${project.name}») o el usuario es un estudiante o la consulta versa sobre estudio, ejercicios o tutoría:
   - **NO envíes a la persona a validar una idea en el mercado**, ni asumas que tiene una empresa o startup, ni hables de entrevistas a clientes, disposición a pagar, tracción ni ventas.
   - En su lugar, actúa como un **tutor pedagógico con IA**: explica didácticamente los conceptos con ejemplos claros, utiliza preguntas socráticas para estimular su razonamiento, propone ejercicios de práctica formativa y ayúdale a formular preguntas estratégicas para su mentor o tutor humano.
5. **Acompañamiento a Mentores y Tutores**:
   Cuando el usuario interactúe con el rol de mentor o tutor, ayúdale a diagnosticar vacíos conceptuales del estudiante, estructurar dinámicas de clase o sesión, diseñar ejercicios formativos y sintetizar compromisos de aprendizaje.

<session_and_tool_guidelines>
Estás interactuando en la sesión: ${currentLocation}.
Selecciona las herramientas especializadas según el contexto y la intención del usuario:
1. **Resumir conversación o consolidar contexto de la etapa** (ej. "hacer un resumen de lo que sabemos en esta conversación para agregarlo como contexto de la etapa entender"):
   - Llama a **update_context_memory** (Workflow RAX-03).
   - Sintetiza la conversación y genera una propuesta de tipo diagnosis_item con category: "context" para la etapa ${currentStage}.
   - NUNCA generes tareas de entrevistas comerciales ni validación de mercado ante solicitudes de resumen.
2. **Identificar afirmaciones, conceptos o supuestos**: Llama a **extract_diagnosis_items** (Workflow RAX-04).
3. **Proponer metas u objetivos formativos o del ciclo**: Llama a **propose_goals** (Workflow RAX-07).
4. **Planificar actividades o tareas**: Llama a **propose_tasks** (Workflow RAX-08).
   - En proyectos formativos («${project.name}»): las tareas DEBEN ser de tipo skill_learning o research (ej. ejercicios de código, mapas conceptuales, preguntas para la tutoría).
5. **Preparar sesión o tutoría**: Llama a **generate_mentor_briefing** (Workflow RAX-05) o **synthesize_session** (Workflow RAX-06).
6. **Recomendar recursos o guías**: Llama a **recommend_resources** (Workflow RAX-11).
7. **Diseñar experimentos o autoevaluaciones**: Llama a **design_experiment** (Workflow RAX-12). En aprendizaje, diseña ejercicios prácticos de autoevaluación (Técnica Feynman); solo en startups comerciales diseña validaciones de mercado.
</session_and_tool_guidelines>

<project_instructions>
${customInstructions}
</project_instructions>

${knowledgeBlock}

<platform_workflows>
Como orquestador de RAX, tienes acceso a los siguientes workflows especializados:
- RAX-03 (update_context_memory): Resumir la conversación y consolidar el contexto de la etapa en la memoria del proyecto.
- RAX-04 (extract_diagnosis_items): Identificar y extraer supuestos, hechos u observaciones al diagnóstico.
- RAX-07 (propose_goals): Proponer metas y objetivos de aprendizaje o desarrollo.
- RAX-08 (propose_tasks): Proponer plan de acción y tareas con fechas estimadas.
- RAX-06 (synthesize_session): Sintetizar acuerdos y compromisos tras reuniones.
- RAX-05 (generate_mentor_briefing): Preparar briefing previo con puntos ciegos para el mentor.
- RAX-09 (diagnose_task_delays): Diagnosticar causas de bloqueos o retrasos sin formular juicios morales.
- RAX-11 (recommend_resources): Recomendar plantillas o recursos metodológicos según la fase.
- RAX-12 (design_experiment): Diseñar hipótesis y experimentos de validación con criterios ex-ante o autoevaluaciones.
- RAX-14 (evaluate_mentorship_cycle): Evaluar ciclo y madurez de la iniciativa.
- RAX-15 (query_project_metrics): Consultar métricas del proyecto (tareas, hipótesis, experimentos, sesiones).
Cuando tu respuesta requiera estructurar una acción en el proyecto, invoca la herramienta correspondiente para que el usuario pueda revisarla y aplicarla con un clic.
</platform_workflows>

<artifact_instructions>
Cuando se te pida diseñar interfaces, componentes de UI, dashboards, diagramas de arquitectura, tablas complejas o scripts:
1. Emite un artefacto estructurado utilizando exactamente la etiqueta <antArtifact>:
   <antArtifact identifier="identificador-unico" type="application/vnd.ant.react | text/html | image/svg+xml | application/vnd.ant.mermaid | application/vnd.ant.code | application/vnd.ant.markdown" title="Título del Artefacto" language="lenguaje_opcional">
   [código o contenido íntegro sin truncar]
   </antArtifact>
2. Acompaña el artefacto con un mensaje introductorio o resumen explicativo en el texto principal.
</artifact_instructions>`;
}

/**
 * Invoca el modelo a través de OpenRouter con soporte para Claude Projects.
 * Si no hay clave de OpenRouter, genera una respuesta simulada enriquecida con artefactos.
 */
export async function executeClaudeAgentTurn(input: ClaudeTurnInput): Promise<ClaudeTurnResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const systemPrompt = buildSystemPrompt(input.project, input.knowledge, input.role, input.sessionContext);

  if (!apiKey) {
    return generateSimulatedClaudeTurn(input);
  }

  const model =
    process.env.CLAUDE_PROJECTS_MODEL ||
    process.env.CLAUDE_MODEL ||
    process.env.OPENROUTER_MODEL ||
    "anthropic/claude-sonnet-4.5";

  const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown; [key: string]: unknown }> = [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
    ...input.history.slice(-14).map((m) => ({
      role: m.author === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    {
      role: "user",
      content: input.userMessage,
    },
  ];

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "RAX Claude Projects",
      },
      body: JSON.stringify({
        model,
        messages,
        cache_control: { type: "ephemeral" },
        tools: RAX_WORKFLOW_TOOLS.map((tool) => ({
          type: "function",
          function: tool,
        })),
        max_tokens: 4000,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[claude-orchestrator] Fallo OpenRouter ${res.status}: ${errText}`);
      return generateSimulatedClaudeTurn(input);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: {
          cached_tokens?: number;
          cache_write_tokens?: number;
        };
      };
    };

    const choice = json.choices?.[0]?.message;
    const rawReply = choice?.content ?? "";
    const { cleanText, artifacts } = extractArtifacts(rawReply);

    const proposals: AiProposalItem[] = [];
    let toolExecutionNotes = "";

    if (choice?.tool_calls && choice.tool_calls.length > 0 && input.deps) {
      for (const call of choice.tool_calls) {
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          const toolResult = await executeWorkflowTool(input.deps, input.project.id, call.function.name, args);
          if (toolResult.proposals.length > 0) {
            proposals.push(...toolResult.proposals);
          }
          toolExecutionNotes += `\n\n📌 **${toolResult.summary}**`;
        } catch (e) {
          console.warn("[claude-orchestrator] Error ejecutando tool call:", e);
        }
      }
    }

    const cachedTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const writeTokens = json.usage?.prompt_tokens_details?.cache_write_tokens ?? 0;
    const cacheHit = cachedTokens > 0;

    let cacheStatus: CacheStatus = "miss";
    if (cacheHit) {
      cacheStatus = "hit";
    } else if (writeTokens > 0) {
      cacheStatus = "write";
    } else if (!model.toLowerCase().includes("claude") && !model.toLowerCase().includes("anthropic")) {
      cacheStatus = "unsupported";
    }

    return {
      reply: (cleanText || "He analizado tu solicitud basándome en el contexto del proyecto.") + toolExecutionNotes,
      artifacts,
      citations: input.knowledge.citations,
      proposals,
      mode: input.knowledge.mode,
      cachedPromptUsed: cacheHit,
      cacheStatus,
      cachedTokens,
    };
  } catch (e) {
    console.warn(`[claude-orchestrator] Error conectando con LLM:`, e);
    return generateSimulatedClaudeTurn(input);
  }
}

function generateSimulatedClaudeTurn(input: ClaudeTurnInput): ClaudeTurnResult {
  const query = input.userMessage.toLowerCase();
  const artifacts: AgentArtifact[] = [];
  const proposals: AiProposalItem[] = [];

  let reply = "";

  const projectExt = input.project as Project & { archetype?: string; sector?: string; stage?: string; summary?: string };
  const isLearningProject =
    projectExt.archetype === "learning" ||
    Boolean(projectExt.sector?.toLowerCase().includes("educa")) ||
    /aprend|estudi|react|curso|tutor|programaci[oó]n|javascript|python|materia|clase|universidad|colegio|escuela|formaci[oó]n/i.test(input.project.name) ||
    /aprend|estudi|curso|tutor|formaci[oó]n/i.test(input.project.description || projectExt.summary || "");

  const isLearningQuery =
    /aprend|estudi|tutor|ejercicio|concepto|duda|clase|materia|estudiante|alumno|aprendiz|explicar|pedag[oó]g|c[oó]digo|react|componente/i.test(query);

  const isLearningContext = isLearningProject || isLearningQuery;
  const currentStage = input.sessionContext?.stage || projectExt.stage || "entender";
  const stageName = /entender|explor/.test(query)
    ? "Entender"
    : /evaluar|test/.test(query)
      ? "Evaluar"
      : /construir|build/.test(query)
        ? "Construir"
        : currentStage.charAt(0).toUpperCase() + currentStage.slice(1);

  // 1. Resumen de conversación, contexto de etapa o memoria contextual (Workflow RAX-03)
  if (/resumen|s[ií]ntesis|contexto|memoria|qu[eé] sabemos|lo que sabemos/.test(query)) {
    if (isLearningContext) {
      proposals.push(
        makeProposal({
          type: "diagnosis_item",
          title: `Contexto de la etapa «${stageName}» — Síntesis de conversación`,
          description: `Síntesis acumulada de la conversación para el aprendizaje de «${input.project.name}»:\n- Objetivo formativo: Dominar los conceptos fundamentales y la estructura práctica del tema.\n- Enfoque pedagógico: Andamiaje conceptual progresivo y formulación de preguntas reflexivas para la tutoría.\n- Estado: Contexto consolidado para la etapa ${stageName}.`,
          category: "context",
          needsHumanApproval: true,
        }),
      );
      reply = `He analizado la conversación de «${input.project.name}» y generado el resumen de contexto para la etapa «${stageName}» (Workflow RAX-03: Context Memory). Te propongo agregarlo al diagnóstico del proyecto para que tu mentor o tutor disponga de este marco conceptual consolidado.`;
    } else {
      proposals.push(
        makeProposal({
          type: "diagnosis_item",
          title: `Contexto de la etapa «${stageName}» — Síntesis de conversación`,
          description: `Síntesis acumulada de la conversación para «${input.project.name}» en la etapa ${stageName}:\n- Contexto del problema y situación inicial identificados en la conversación.\n- Supuestos clave y observaciones compartidas.\n- Estado: Registrado para avance hacia la siguiente etapa.`,
          category: "context",
          needsHumanApproval: true,
        }),
      );
      reply = `He sintetizado los puntos clave de esta conversación para la etapa «${stageName}» (Workflow RAX-03: Context Memory). Te propongo guardar este resumen como contexto de la etapa en el diagnóstico del proyecto.`;
    }
  } else if (isLearningContext) {
    if (/(?:^|[^\w])(tarea|tareas|plan de acci[oó]n|acciones|pendientes?|to-?do list)(?:[^\w]|$)/i.test(query)) {
      proposals.push(
        makeProposal({ type: "task", title: "Repasar conceptos fundamentales y elaborar un mapa de ideas", description: "Enfocado en consolidar la comprensión teórica antes de avanzar a la práctica", actionType: "skill_learning", needsHumanApproval: true }),
        makeProposal({ type: "task", title: "Resolver 2 ejercicios prácticos de aplicación autónoma", description: "Identificar dudas puntuales y verificar comprensión", actionType: "skill_learning", needsHumanApproval: true }),
        makeProposal({ type: "task", title: "Preparar 3 preguntas específicas para la sesión con el mentor/tutor", description: "Llegar a la tutoría con los puntos de bloqueo claramente identificados", actionType: "research", needsHumanApproval: true }),
      );
      reply = `Como tu tutor y copiloto de aprendizaje con IA, he estructurado un plan de estudio y práctica (Workflow RAX-08) adaptado a tu proceso formativo. Te sugiero estas ${proposals.length} actividades para avanzar a tu propio ritmo con el apoyo de tu mentor o tutor.`;
    } else if (/hip[oó]tesis|experimento|validar|probar/.test(query)) {
      proposals.push(
        makeProposal({ type: "task", title: "Ejercicio de autoevaluación: explicar el concepto en tus palabras con un ejemplo", description: "Técnica Feynman para comprobar que no quedan lagunas conceptuales", actionType: "skill_learning", needsHumanApproval: true }),
        makeProposal({ type: "task", title: "Revisar aplicación práctica con el mentor/tutor", description: "Validar tu razonamiento y recibir retroalimentación formativa", actionType: "research", needsHumanApproval: true }),
      );
      reply = `En lugar de una validación comercial, hemos diseñado un ejercicio de autoevaluación y verificación de comprensión formativa. Esto te permitirá comprobar tu dominio del tema y discutirlo con tu tutor.`;
    } else if (/sesi[oó]n|briefing|mentor|tutor/.test(query)) {
      proposals.push(
        makeProposal({ type: "agenda_topic", title: "Punto de tutoría: Revisar dudas conceptuales identificadas durante el estudio", needsHumanApproval: true }),
        makeProposal({ type: "agenda_topic", title: "Pregunta para mentor/tutor: ¿Cuál es el error más frecuente al aplicar este concepto?", needsHumanApproval: true }),
      );
      reply = `He preparado el temario y las preguntas formativas para tu próxima sesión de tutoría con tu mentor o tutor (Workflow RAX-05).`;
    } else if (/recurso|plantilla|gu[ií]a/.test(query)) {
      proposals.push(
        makeProposal({ type: "recommendation", title: "Guía de estudio estructurada y marco conceptual", description: "Material didáctico para profundizar en el tema con ejemplos paso a paso", needsHumanApproval: false }),
      );
      reply = `He consultado el catálogo de recursos formativos de RAX (Workflow RAX-11) y te recomiendo este material de apoyo pedagógico.`;
    } else {
      proposals.push(
        makeProposal({ type: "task", title: "Anotar dudas clave para la próxima tutoría", description: "Registrar preguntas concretas surgidas durante el estudio", actionType: "skill_learning", needsHumanApproval: true }),
      );
      reply = `Entendido. Como copiloto pedagógico con IA, estoy aquí para guiarte en tu proceso de aprendizaje paso a paso. Recuerda que no necesitas validar ningún modelo comercial: el objetivo es comprender el tema, desarrollar tus habilidades y apoyarte en tu mentor o tutor para resolver cualquier inquietud. ¿Hay algún concepto específico en el que te gustaría que profundicemos?`;
    }
  } else if (/(?:^|[^\w])(tarea|tareas|plan de acci[oó]n|acciones|pendientes?|to-?do list)(?:[^\w]|$)/i.test(query)) {
    proposals.push(
      makeProposal({ type: "task", title: "Definir guion de 10 entrevistas con clientes potenciales", description: "Enfocado en validar el problema real y la disposición a pagar", actionType: "operational_task", needsHumanApproval: true }),
      makeProposal({ type: "task", title: "Elaborar propuesta de valor en una sola frase", description: "Para comprobar comprensión inmediata con mentores", actionType: "operational_task", needsHumanApproval: true }),
    );
    reply = `He analizado las prioridades de «${input.project.name}» e invocado la formulación de tareas (Workflow RAX-08). Te propongo ${proposals.length} acciones prioritarias para avanzar en la hoja de ruta.`;
  } else if (/hip[oó]tesis|experimento|validar|probar/.test(query)) {
    proposals.push(
      makeProposal({ type: "hypothesis", title: "Los clientes B2B están dispuestos a pagar suscripción mensual por automatizar reportes", needsHumanApproval: true }),
      makeProposal({ type: "experiment", title: "Preventa con 15 contactos directos", description: "Método: Entrevistas de solución y carta de intención. Éxito: >= 20%. Descarte: < 5%", needsHumanApproval: true }),
    );
    reply = `He estructurado la hipótesis y diseñado el experimento ex-ante (Workflow RAX-12). Los criterios ex-ante quedaron fijados para verificar resultados objetivamente.`;
  } else if (/diagn[oó]stico|supuesto|problema|mercado/.test(query)) {
    proposals.push(
      makeProposal({ type: "diagnosis_item", title: "Dificultad de adopción por software legado", description: "Los prospectos mencionan resistencia al cambio de sus equipos", category: "operational", needsHumanApproval: true }),
      makeProposal({ type: "diagnosis_item", title: "Falta de presupuesto asignado para nuevas herramientas", description: "Supuesto de riesgo financiero identificado en la conversación", category: "financial", needsHumanApproval: true }),
    );
    reply = `He extraído los elementos clave de la conversación para el diagnóstico estructurado del proyecto (Workflow RAX-04).`;
  } else if (/m[eé]trica|estado del proyecto|avance|resumen/.test(query)) {
    reply = `Consultando el estado operativo del proyecto (Workflow RAX-15): El proyecto «${input.project.name}» cuenta con sus registros sincronizados y activos en el entorno de trabajo.`;
  } else if (/recurso|plantilla|gu[ií]a/.test(query)) {
    proposals.push(
      makeProposal({ type: "recommendation", title: "Plantilla de Entrevista de Descubrimiento de Clientes", description: "Guía paso a paso para evitar preguntas sesgadas", needsHumanApproval: false }),
    );
    reply = `He consultado el catálogo metodológico de RAX (Workflow RAX-11) y te recomiendo la siguiente plantilla de apoyo.`;
  } else if (/sesi[oó]n|briefing|mentor/.test(query)) {
    proposals.push(
      makeProposal({ type: "agenda_topic", title: "Punto de agenda: Revisar definición de criterio de éxito del experimento", needsHumanApproval: true }),
      makeProposal({ type: "agenda_topic", title: "Pregunta para mentor: ¿Qué métrica de retención considera mínima en esta etapa?", needsHumanApproval: true }),
    );
    reply = `He preparado el briefing y temas estratégicos para la sesión con tu mentor (Workflow RAX-05).`;
  } else if (/interfaz|ui|calculadora|pantalla|dashboard|html/.test(query)) {
    artifacts.push({
      id: `art_sim_${Date.now()}`,
      identifier: "interactive-roi-calc",
      title: "Calculadora de Experimentos y ROI",
      type: "text/html",
      language: "html",
      content: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-6 bg-slate-900 text-slate-100 font-sans">
  <div class="max-w-md mx-auto bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
    <h2 class="text-lg font-bold text-orange-400 mb-2">Simulador de Experimento</h2>
    <p class="text-xs text-slate-400 mb-4">Calcula la tasa de conversión esperada para el criterio de validación.</p>
    <div class="space-y-4">
      <div>
        <label class="text-xs text-slate-300 block mb-1">Muestra de contactos:</label>
        <input id="sample" type="number" value="100" class="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white" />
      </div>
      <div>
        <label class="text-xs text-slate-300 block mb-1">Respuestas positivas mínimas:</label>
        <input id="positives" type="number" value="15" class="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white" />
      </div>
      <button onclick="calc()" class="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2 rounded text-sm transition">Calcular Criterio</button>
      <div id="result" class="p-3 bg-slate-950/60 rounded text-xs text-emerald-400 font-mono mt-3">Tasa mínima de éxito: 15.0%</div>
    </div>
  </div>
  <script>
    function calc() {
      const s = Number(document.getElementById('sample').value) || 1;
      const p = Number(document.getElementById('positives').value) || 0;
      const rate = ((p / s) * 100).toFixed(1);
      document.getElementById('result').innerText = 'Tasa mínima de éxito: ' + rate + '%';
    }
  </script>
</body>
</html>`,
    });
    reply = `He preparado el componente interactivo para tu proyecto según los criterios de experimentación y contexto definidos. Puedes interactuar con la calculadora en la ventana de artefactos contigua.`;
  } else if (/diagrama|flujo|arquitectura|mermaid/.test(query)) {
    artifacts.push({
      id: `art_sim_${Date.now()}`,
      identifier: "experimentation-funnel",
      title: "Diagrama de Embudo y Validación",
      type: "application/vnd.ant.mermaid",
      language: "mermaid",
      content: `graph TD
  A["Hipótesis Validada"] --> B["Diseño de Experimento"]
  B --> C["Criterio Éxito >= 15%"]
  C --> D{"Medición de Resultados"}
  D -->|"Supera Criterio"| E["Avanzar a Solución"]
  D -->|"No Alcanza"| F["Iterar o Descartar Hipótesis"]`,
    });
    reply = `He generado el diagrama de flujo correspondiente al ciclo de validación de este proyecto. Se encuentra renderizado en el panel de artefactos.`;
  } else {
    const docMentions =
      input.knowledge.inContextDocs && input.knowledge.inContextDocs.length > 0
        ? `\n\nHe consultado los documentos del proyecto (${input.knowledge.inContextDocs.map((d) => d.filename).join(", ")}) bajo la estrategia In-Context con caché activa.`
        : "";

    reply = `Entendido. En el marco del proyecto «${input.project.name}», mantengo activas las directrices establecidas.${docMentions}\n\n¿En qué aspecto específico de la hipótesis, diagnóstico o experimento deseas que profundicemos ahora? Puedes guardar cualquier conclusión relevante directamente en el conocimiento del proyecto.`;
  }

  return {
    reply,
    artifacts,
    citations: input.knowledge.citations,
    proposals,
    mode: input.knowledge.mode,
    cachedPromptUsed: false,
    cacheStatus: "simulated",
    cachedTokens: 0,
  };
}
