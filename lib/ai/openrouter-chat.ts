import "server-only";
import { DEFAULT_OPENROUTER_MODEL } from "./openrouter";

/**
 * Cliente mínimo de chat completions de OpenRouter para el agente conversacional: prueba el modelo
 * principal y los de respaldo en orden, y se adapta a modelos que no aceptan herramientas o
 * instrucciones de sistema. Nunca registra la clave ni el contenido de la conversación.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatToolCall {
  id?: string;
  type?: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
}

export interface ChatCompletion {
  model: string;
  content: string;
  toolCalls: ChatToolCall[];
  usage?: ChatUsage;
}

export interface ChatFailure {
  code: "rate_limited" | "not_configured" | "provider_error" | "refused";
  message: string;
}

/** Modelos a probar, en orden: el del agente (o el general) y luego los de respaldo. */
export function agentModels(): string[] {
  const primary = process.env.CLAUDE_PROJECTS_MODEL || process.env.CLAUDE_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? "").split(",");
  return [...new Set([primary, ...fallbacks].map((m) => m.trim()).filter(Boolean))];
}

interface CallOptions {
  apiKey: string;
  messages: ChatMessage[];
  tools?: Array<{ type: "function"; function: unknown }>;
  toolChoice?: "auto" | "none";
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  models?: string[];
}

type Attempt = { ok: true; data: ChatCompletion } | { ok: false; status: number; detail: string };

/** Llama a los modelos en orden hasta que uno responda. Devuelve el fallo más útil si ninguno lo hace. */
export async function chatWithFallback(opts: CallOptions): Promise<{ ok: true; completion: ChatCompletion } | { ok: false; failure: ChatFailure }> {
  const models = opts.models ?? agentModels();
  let failure: ChatFailure = { code: "provider_error", message: "El proveedor de IA no respondió." };
  for (const model of models) {
    let useTools = Boolean(opts.tools?.length);
    let merge = false;
    let json = Boolean(opts.jsonMode);
    for (let adapt = 0; adapt < 3; adapt++) {
      const attempt = await callOnce(model, opts, { useTools, merge, json });
      if (attempt.ok) return { ok: true, completion: attempt.data };
      const { status, detail } = attempt;
      if (useTools && (status === 400 || status === 404 || status === 422) && /tool|function/i.test(detail)) {
        useTools = false;
        continue;
      }
      if (!merge && (status === 400 || status === 422) && /system|developer instruction/i.test(detail)) {
        merge = true;
        continue;
      }
      if (json && (status === 400 || status === 404 || status === 422) && /response_format|json/i.test(detail)) {
        json = false;
        continue;
      }
      failure = classify(model, status, detail);
      break;
    }
    // Clave inválida o cupo diario agotado: ningún otro modelo va a responder.
    if (failure.code === "not_configured" || /cupo diario/.test(failure.message)) break;
  }
  return { ok: false, failure };
}

async function callOnce(model: string, opts: CallOptions, mode: { useTools: boolean; merge: boolean; json: boolean }): Promise<Attempt> {
  const messages = mode.merge ? mergeSystem(opts.messages) : opts.messages;
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "RAX",
      },
      body: JSON.stringify({
        model,
        messages,
        // Caché de prompt automática (Anthropic y compatibles): el prefijo estable va primero.
        cache_control: { type: "ephemeral" },
        ...(mode.useTools && opts.tools?.length ? { tools: opts.tools, ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}) } : {}),
        ...(mode.json ? { response_format: { type: "json_object" } } : {}),
        max_tokens: opts.maxTokens ?? 2500,
        temperature: opts.temperature ?? 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[agent-llm] ${model}: sin conexión: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, status: 0, detail: "network" };
  }
  type Body = {
    model?: string;
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatToolCall[] } }>;
    usage?: ChatUsage;
    error?: { message?: string; code?: number; metadata?: { provider_name?: string; raw?: unknown } };
  };
  let data: Body = {};
  let rawText = "";
  if (typeof res.text === "function") {
    rawText = await res.text().catch(() => "");
    try {
      data = JSON.parse(rawText) as Body;
      rawText = "";
    } catch {
      data = {};
    }
  } else if (typeof res.json === "function") {
    data = ((await res.json().catch(() => ({}))) ?? {}) as Body;
  }
  const status = data.error ? data.error.code || res.status : res.status;
  if (res.ok && !data.error) {
    const msg = data.choices?.[0]?.message;
    return { ok: true, data: { model: data.model ?? model, content: msg?.content ?? "", toolCalls: msg?.tool_calls ?? [], usage: data.usage } };
  }
  const raw = data.error?.metadata?.raw;
  const detail = [data.error?.message, data.error?.metadata?.provider_name, typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "", rawText.slice(0, 300)]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 600);
  console.error(`[agent-llm] ${model}: HTTP ${status}: ${detail || "(sin detalle)"}`);
  return { ok: false, status, detail };
}

function classify(model: string, status: number, detail: string): ChatFailure {
  if (status === 0) return { code: "provider_error", message: "No pudimos conectar con el proveedor de IA." };
  if (status === 401) return { code: "not_configured", message: "La clave de OpenRouter no es válida." };
  if (status === 402) return { code: "rate_limited", message: "La cuenta de OpenRouter no tiene saldo para este modelo." };
  if (status === 429) {
    if (/per[- ]day|free-models-per|daily/i.test(detail)) {
      return { code: "rate_limited", message: "Se agotó el cupo diario de modelos gratuitos de OpenRouter. Se renueva cada día." };
    }
    return { code: "rate_limited", message: `Los modelos de IA están saturados en este momento (${model}). Probá de nuevo en unos minutos.` };
  }
  if (status === 403) return { code: "refused", message: "El proveedor de IA rechazó el mensaje (moderación)." };
  if (status === 404) return { code: "provider_error", message: `El modelo ${model} no está disponible en OpenRouter.` };
  if (status === 408 || status >= 500) return { code: "provider_error", message: `El modelo ${model} no respondió a tiempo.` };
  return { code: "provider_error", message: `El proveedor de IA devolvió un error (${status}).` };
}

/** Para modelos sin rol de sistema: las instrucciones van al inicio del primer mensaje de la persona. */
function mergeSystem(messages: ChatMessage[]): ChatMessage[] {
  const text = (c: ChatMessage["content"]) => (typeof c === "string" ? c : (c ?? []).map((p) => p.text).join("\n"));
  const system = messages.filter((m) => m.role === "system").map((m) => text(m.content)).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const idx = rest.findIndex((m) => m.role === "user");
  if (!system || idx < 0) return rest;
  return rest.map((m, i) => (i === idx ? { ...m, content: `${system}\n\n---\n\n${text(m.content)}` } : m));
}
