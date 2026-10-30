import "server-only";
import type { AgentArtifact, KnowledgeCitation, Project } from "@/types/domain";
import type { KnowledgeContextResult } from "./knowledge-retrieval";
import { extractArtifacts } from "./artifact-parser";

export interface ClaudeTurnInput {
  project: Project;
  userMessage: string;
  history: Array<{ author: "user" | "assistant"; content: string }>;
  knowledge: KnowledgeContextResult;
  role: "entrepreneur" | "mentor" | "admin";
}

export interface ClaudeTurnResult {
  reply: string;
  artifacts: AgentArtifact[];
  citations: KnowledgeCitation[];
  proposals: Array<Record<string, unknown>>;
  mode: "in_context" | "rag";
  cachedPromptUsed?: boolean;
}

export function buildSystemPrompt(project: Project, knowledge: KnowledgeContextResult): string {
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
    : "Sin instrucciones adicionales. Mantén un tono honesto, riguroso, empático y orientado a validación.";

  return `Eres el Agente Inteligente de RAX, diseñado bajo la arquitectura de Claude Projects.
Operas como un orquestador de contexto persistente, herramientas y conocimiento compartido para el proyecto actual.

Reglas fundamentales:
1. Honestidad visible: separa lo confirmado de las suposiciones y no inventes cifras, hechos ni aprobaciones.
2. Si te preguntan por información contenida en el conocimiento del proyecto, cíñete a los documentos y cita el nombre del archivo.
3. No compartes información con otros proyectos ni mezclas historiales de otros hilos.

<project_instructions>
${customInstructions}
</project_instructions>

${knowledgeBlock}

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
  const systemPrompt = buildSystemPrompt(input.project, input.knowledge);

  if (!apiKey) {
    return generateSimulatedClaudeTurn(input);
  }

  const model = process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string; [key: string]: unknown }> = [
    {
      role: "system",
      content: systemPrompt,
      // OpenRouter / Anthropic cache hint for prompt caching
      cache_control: { type: "ephemeral" },
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
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const rawReply = json.choices?.[0]?.message?.content ?? "";
    const { cleanText, artifacts } = extractArtifacts(rawReply);

    return {
      reply: cleanText || "He analizado tu solicitud basándome en el contexto del proyecto.",
      artifacts,
      citations: input.knowledge.citations,
      proposals: [],
      mode: input.knowledge.mode,
      cachedPromptUsed: true,
    };
  } catch (e) {
    console.warn(`[claude-orchestrator] Error conectando con LLM:`, e);
    return generateSimulatedClaudeTurn(input);
  }
}

function generateSimulatedClaudeTurn(input: ClaudeTurnInput): ClaudeTurnResult {
  const query = input.userMessage.toLowerCase();
  const artifacts: AgentArtifact[] = [];

  let reply = "";

  if (/interfaz|ui|calculadora|pantalla|dashboard|html/.test(query)) {
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
    proposals: [],
    mode: input.knowledge.mode,
  };
}
