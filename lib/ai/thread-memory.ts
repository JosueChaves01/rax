import type { AgentMessage, AgentThreadMemory } from "@/types/domain";

/**
 * Estado conversacional de un hilo. Cada hilo del agente guarda:
 * - los mensajes completos (agent_messages), y
 * - una memoria compacta (agent_threads.memory): resumen acumulado de los mensajes viejos, decisiones
 *   y preguntas abiertas, más cuántos mensajes ya quedaron resumidos.
 *
 * En cada turno el modelo recibe la memoria + los mensajes recientes completos. Así un hilo largo no
 * pierde lo que se habló al principio y el prompt no crece sin límite.
 */

export const THREAD_WINDOW = {
  /** Mensajes recientes que siempre van completos. */
  keepRecent: 12,
  /** Cuando hay más de esto sin resumir, los más viejos se pliegan en la memoria. */
  foldAbove: 20,
  /** Tope de caracteres del historial reciente enviado al modelo. */
  maxHistoryChars: 24_000,
  maxSummaryChars: 4_000,
  maxListItems: 12,
} as const;

export const EMPTY_MEMORY: AgentThreadMemory = { summary: "", decisions: [], openQuestions: [], coveredMessageCount: 0 };

export function normalizeMemory(memory: Partial<AgentThreadMemory> | null | undefined): AgentThreadMemory {
  const strings = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
  return {
    summary: typeof memory?.summary === "string" ? memory.summary : "",
    decisions: strings(memory?.decisions).slice(-THREAD_WINDOW.maxListItems),
    openQuestions: strings(memory?.openQuestions).slice(-THREAD_WINDOW.maxListItems),
    coveredMessageCount: Number.isInteger(memory?.coveredMessageCount) && memory!.coveredMessageCount! > 0 ? memory!.coveredMessageCount! : 0,
    ...(memory?.updatedAt ? { updatedAt: memory.updatedAt } : {}),
  };
}

/** Solo cuentan los mensajes válidos: los fallos del agente no son parte de la conversación. */
export function conversationalMessages(messages: AgentMessage[]): AgentMessage[] {
  return [...messages].filter((m) => m.status !== "failed").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Mensajes que van completos al modelo: los no resumidos, los más recientes primero hasta el tope.
 * Con `conversationalTotal`, `messages` puede ser solo la cola del hilo (los más recientes): los no
 * resumidos se cuentan desde el final en vez de por posición.
 */
export function recentHistory(
  messages: AgentMessage[],
  memory: AgentThreadMemory,
  conversationalTotal?: number,
): Array<{ author: "user" | "assistant"; content: string }> {
  const valid = conversationalMessages(messages);
  const pendingCount = conversationalTotal === undefined ? valid.length - memory.coveredMessageCount : conversationalTotal - memory.coveredMessageCount;
  const pending = pendingCount > 0 ? valid.slice(-pendingCount) : [];
  const out: Array<{ author: "user" | "assistant"; content: string }> = [];
  let chars = 0;
  for (const m of pending.slice(-THREAD_WINDOW.foldAbove).reverse()) {
    const content = m.content.length > 4000 ? `${m.content.slice(0, 4000)}…` : m.content;
    if (out.length > 0 && chars + content.length > THREAD_WINDOW.maxHistoryChars) break;
    chars += content.length;
    out.unshift({ author: m.author, content: proposalNote(m, content) });
  }
  // El historial que ve el modelo empieza siempre con la persona.
  while (out[0]?.author === "assistant" && out.length > 1) out.shift();
  return out;
}

/** El modelo debe saber qué propuso antes, aunque las tarjetas no estén en el texto. */
function proposalNote(m: AgentMessage, content: string): string {
  if (m.author !== "assistant" || !m.proposals?.length) return content;
  const titles = m.proposals
    .map((p) => (typeof p.title === "string" ? `${typeof p.type === "string" ? p.type : "propuesta"}: ${p.title}` : null))
    .filter(Boolean)
    .slice(0, 8);
  return titles.length ? `${content}\n\n[Propuestas ofrecidas en este mensaje: ${titles.join(" | ")}]` : content;
}

/** Mensajes que hay que plegar en la memoria ahora (vacío si todavía entran en la ventana). */
export function messagesToFold(messages: AgentMessage[], memory: AgentThreadMemory): AgentMessage[] {
  const all = conversationalMessages(messages);
  const pending = all.length - memory.coveredMessageCount;
  if (pending <= THREAD_WINDOW.foldAbove) return [];
  return all.slice(memory.coveredMessageCount, all.length - THREAD_WINDOW.keepRecent);
}

/** Pliegue determinista (sin IA): conserva lo esencial de cada intercambio, recortado. */
export function foldDeterministic(memory: AgentThreadMemory, folded: AgentMessage[], now: string): AgentThreadMemory {
  const lines = folded.map((m) => `${m.author === "user" ? "Persona" : "RAX"}: ${m.content.replace(/\s+/g, " ").slice(0, 220)}`);
  return withSummary(memory, [memory.summary, lines.join("\n")].filter(Boolean).join("\n"), memory.decisions, memory.openQuestions, folded.length, now);
}

export function withSummary(
  memory: AgentThreadMemory,
  summary: string,
  decisions: string[],
  openQuestions: string[],
  foldedCount: number,
  now: string,
): AgentThreadMemory {
  const trimmed = summary.length > THREAD_WINDOW.maxSummaryChars ? `…${summary.slice(-THREAD_WINDOW.maxSummaryChars)}` : summary;
  return normalizeMemory({
    summary: trimmed.trim(),
    decisions: [...new Set(decisions.map((d) => d.trim().slice(0, 300)))],
    openQuestions: [...new Set(openQuestions.map((q) => q.trim().slice(0, 300)))],
    coveredMessageCount: memory.coveredMessageCount + foldedCount,
    updatedAt: now,
  });
}

/** Instrucción para que el modelo actualice la memoria del hilo. Devuelve JSON. */
export const MEMORY_SYSTEM_PROMPT = `Mantienes la memoria de un hilo de conversación de RAX (plataforma de acompañamiento a emprendedores y estudiantes con mentor).
Recibes la memoria actual y mensajes viejos que salen de la ventana. Devuelve SOLO un JSON:
{"summary": "...", "decisions": ["..."], "openQuestions": ["..."]}
- summary: hasta 12 frases en español; qué se habló, qué se sabe del proyecto, qué se propuso y qué quedó pendiente. Integra la memoria anterior, no la repitas aparte.
- decisions: acuerdos o decisiones explícitas de la persona (no suposiciones). Máximo 12.
- openQuestions: preguntas o dudas que siguen abiertas. Quita las que ya se respondieron. Máximo 12.
No inventes datos: si algo no se dijo, no lo pongas.`;

export function renderMemoryInput(memory: AgentThreadMemory, folded: AgentMessage[]): string {
  return JSON.stringify({
    memoriaActual: { summary: memory.summary, decisions: memory.decisions, openQuestions: memory.openQuestions },
    mensajes: folded.map((m) => ({ autor: m.author === "user" ? "persona" : "RAX", texto: m.content.slice(0, 2000) })),
  });
}

export function parseMemoryOutput(raw: string): { summary: string; decisions: string[]; openQuestions: string[] } | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof data.summary !== "string" || !data.summary.trim()) return null;
    const strings = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string") : []);
    return { summary: data.summary, decisions: strings(data.decisions), openQuestions: strings(data.openQuestions) };
  } catch {
    return null;
  }
}

/** Bloque del prompt con la memoria del hilo. */
export function renderThreadMemory(thread: { title: string }, memory: AgentThreadMemory, totalMessages: number): string {
  const has = memory.summary || memory.decisions.length || memory.openQuestions.length;
  if (!has) {
    return `<thread_state title="${thread.title.replace(/"/g, "'")}" messages="${totalMessages}">
Este hilo no tiene memoria resumida todavía: todo lo conversado está en los mensajes que siguen.
</thread_state>`;
  }
  return `<thread_state title="${thread.title.replace(/"/g, "'")}" messages="${totalMessages}" summarized="${memory.coveredMessageCount}">
Resumen de lo conversado antes en este hilo:
${memory.summary || "—"}
Decisiones de la persona:
${memory.decisions.length ? memory.decisions.map((d) => `- ${d}`).join("\n") : "- ninguna registrada"}
Preguntas abiertas:
${memory.openQuestions.length ? memory.openQuestions.map((q) => `- ${q}`).join("\n") : "- ninguna"}
</thread_state>`;
}
