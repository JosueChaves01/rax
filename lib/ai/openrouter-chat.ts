import "server-only";
import { DEFAULT_OPENROUTER_MODEL } from "./openrouter";

/**
 * Cliente mínimo de chat completions de OpenRouter para el agente conversacional: prueba el modelo
 * principal y los de respaldo en orden, y se adapta a modelos que no aceptan herramientas o
 * instrucciones de sistema. Nunca registra la clave ni el contenido de la conversación.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Máximo que se espera a un modelo antes de pasar al siguiente: la respuesta completa, o el primer trozo con streaming. */
const PER_MODEL_TIMEOUT_MS = { complete: 30_000, firstChunk: 20_000 } as const;
/** Presupuesto por defecto de una llamada completa, con todos los respaldos. */
const DEFAULT_BUDGET_MS = 45_000;
/** Por debajo de esto no vale la pena empezar otro intento. */
const MIN_ATTEMPT_MS = 3_000;

/**
 * Salud de los modelos en esta instancia: uno que acaba de dar 429 o no respondió se prueba al final
 * durante un rato, así el siguiente turno no pierde tiempo esperándolo. Nunca se excluye del todo.
 */
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = { rate_limited: 180_000, slow: 60_000 } as const;

export function resetModelHealth(): void {
  cooldownUntil.clear();
}

/** Modelos sanos primero (en su orden), luego los que están en enfriamiento. */
export function orderByHealth(models: string[], now = Date.now()): string[] {
  const cooled = (m: string) => (cooldownUntil.get(m) ?? 0) > now;
  return [...models.filter((m) => !cooled(m)), ...models.filter(cooled)];
}

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
  code: "rate_limited" | "not_configured" | "provider_error" | "refused" | "timeout";
  message: string;
}

/** Cómo fue la llamada: cuántos intentos, qué modelos fallaron y cuánto tardó la primera respuesta. */
export interface ChatTrace {
  attempts: number;
  failedModels: string[];
  firstTokenMs?: number;
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
  /** Espera máxima por modelo (sin streaming: la respuesta completa; con streaming: el primer trozo). */
  timeoutMs?: number;
  /** Momento (epoch ms) en que hay que rendirse aunque queden modelos por probar. */
  deadline?: number;
  /** Con esto la respuesta llega por partes (streaming) y cada trozo de texto se entrega aquí. */
  onDelta?: (text: string) => void;
  /** El modelo falló a mitad de la respuesta y se prueba otro: lo ya entregado se descarta. */
  onReset?: () => void;
}

type Attempt = { ok: true; data: ChatCompletion; firstTokenMs?: number } | { ok: false; status: number; detail: string };

/** Llama a los modelos en orden hasta que uno responda. Devuelve el fallo más útil si ninguno lo hace. */
export async function chatWithFallback(
  opts: CallOptions,
): Promise<({ ok: true; completion: ChatCompletion } | { ok: false; failure: ChatFailure }) & { trace: ChatTrace }> {
  const models = orderByHealth(opts.models ?? agentModels());
  const deadline = opts.deadline ?? Date.now() + DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  const trace: ChatTrace = { attempts: 0, failedModels: [] };
  let failure: ChatFailure = { code: "provider_error", message: "El proveedor de IA no respondió." };
  for (const model of models) {
    let useTools = Boolean(opts.tools?.length);
    let merge = false;
    let json = Boolean(opts.jsonMode);
    let outOfTime = false;
    for (let adapt = 0; adapt < 3; adapt++) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) {
        outOfTime = true;
        break;
      }
      trace.attempts++;
      const attemptStart = Date.now();
      const attempt = await callOnce(model, opts, { useTools, merge, json }, Math.min(opts.timeoutMs ?? (opts.onDelta ? PER_MODEL_TIMEOUT_MS.firstChunk : PER_MODEL_TIMEOUT_MS.complete), remaining), deadline);
      if (attempt.ok) {
        cooldownUntil.delete(model);
        // Desde que empezó la llamada, contando lo que se perdió en modelos que fallaron.
        if (attempt.firstTokenMs !== undefined) trace.firstTokenMs = attemptStart - startedAt + attempt.firstTokenMs;
        return { ok: true, completion: attempt.data, trace };
      }
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
      trace.failedModels.push(model);
      if (status === 429) cooldownUntil.set(model, Date.now() + COOLDOWN_MS.rate_limited);
      else if (status === 0 || status === 408 || status >= 500) cooldownUntil.set(model, Date.now() + COOLDOWN_MS.slow);
      break;
    }
    if (outOfTime) {
      if (trace.attempts === 0 || failure.code === "provider_error") {
        failure = { code: "timeout", message: "Los modelos de IA están tardando demasiado. Prueba de nuevo en un momento." };
      }
      break;
    }
    // Clave inválida o cupo diario agotado: ningún otro modelo va a responder.
    if (failure.code === "not_configured" || /cupo diario/.test(failure.message)) break;
  }
  return { ok: false, failure, trace };
}

async function callOnce(
  model: string,
  opts: CallOptions,
  mode: { useTools: boolean; merge: boolean; json: boolean },
  timeoutMs: number,
  deadline: number,
): Promise<Attempt> {
  const messages = mode.merge ? mergeSystem(opts.messages) : opts.messages;
  const stream = Boolean(opts.onDelta);
  const started = Date.now();
  // Hasta la primera respuesta se espera `timeoutMs`; ya transmitiendo, como mucho hasta el plazo del turno.
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), timeoutMs);
  const extendTo = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), Math.max(1, ms));
  };
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
        ...(stream ? { stream: true, usage: { include: true } } : {}),
        max_tokens: opts.maxTokens ?? 2500,
        temperature: opts.temperature ?? 0.3,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = controller.signal.aborted;
    console.error(`[agent-llm] ${model}: ${aborted ? `sin respuesta en ${timeoutMs} ms` : `sin conexión: ${e instanceof Error ? e.message : String(e)}`}`);
    return { ok: false, status: aborted ? 408 : 0, detail: aborted ? "timeout" : "network" };
  }

  const isStream = stream && res.ok && Boolean(res.body) && /event-stream/i.test(res.headers?.get?.("content-type") ?? "");
  if (isStream) {
    extendTo(deadline - Date.now());
    try {
      return await readStream(model, res, opts, started);
    } finally {
      clearTimeout(timer);
    }
  }

  type Body = {
    model?: string;
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ChatToolCall[] } }>;
    usage?: ChatUsage;
    error?: { message?: string; code?: number; metadata?: { provider_name?: string; raw?: unknown } };
  };
  let data: Body = {};
  let rawText = "";
  try {
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
  } finally {
    clearTimeout(timer);
  }
  const status = data.error ? data.error.code || res.status : res.status;
  if (res.ok && !data.error) {
    const msg = data.choices?.[0]?.message;
    const content = msg?.content ?? "";
    // Sin streaming real (p. ej. el proveedor no lo soporta), el texto se entrega de una vez.
    if (stream && content) opts.onDelta?.(content);
    return {
      ok: true,
      data: { model: data.model ?? model, content, toolCalls: msg?.tool_calls ?? [], usage: data.usage },
      firstTokenMs: Date.now() - started,
    };
  }
  return { ok: false, status, detail: failureDetail(model, status, data.error, rawText) };
}

function failureDetail(
  model: string,
  status: number,
  error: { message?: string; metadata?: { provider_name?: string; raw?: unknown } } | undefined,
  rawText = "",
): string {
  const raw = error?.metadata?.raw;
  const detail = [error?.message, error?.metadata?.provider_name, typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : "", rawText.slice(0, 300)]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 600);
  console.error(`[agent-llm] ${model}: HTTP ${status}: ${detail || "(sin detalle)"}`);
  return detail;
}

/**
 * Lee una respuesta en streaming (SSE de OpenRouter): entrega cada trozo de texto, junta las llamadas a
 * herramientas por índice y toma el uso de tokens del último evento. Si el modelo falla antes de escribir
 * nada, se informa como fallo para probar el siguiente; si falla a mitad, se descarta lo entregado.
 */
async function readStream(model: string, res: Response, opts: CallOptions, started: number): Promise<Attempt> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: ChatUsage | undefined;
  let responseModel = model;
  let firstTokenMs: number | undefined;
  const calls = new Map<number, { id?: string; name: string; args: string }>();
  type Chunk = {
    model?: string;
    usage?: ChatUsage;
    error?: { message?: string; code?: number; metadata?: { provider_name?: string; raw?: unknown } };
    choices?: Array<{
      delta?: { content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
      finish_reason?: string | null;
    }>;
  };
  const fail = (status: number, detail: string): Attempt => {
    if (content) opts.onReset?.();
    return { ok: false, status, detail };
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // comentarios de keep-alive (": OPENROUTER PROCESSING")
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk: Chunk;
        try {
          chunk = JSON.parse(payload) as Chunk;
        } catch {
          continue;
        }
        if (chunk.error) {
          const status = chunk.error.code || 502;
          return fail(status, failureDetail(model, status, chunk.error));
        }
        if (chunk.model) responseModel = chunk.model;
        if (chunk.usage) usage = chunk.usage;
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          if (firstTokenMs === undefined) firstTokenMs = Date.now() - started;
          content += delta.content;
          opts.onDelta?.(delta.content);
        }
        for (const tc of delta?.tool_calls ?? []) {
          if (firstTokenMs === undefined) firstTokenMs = Date.now() - started;
          const idx = tc.index ?? 0;
          const cur = calls.get(idx) ?? { name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(idx, cur);
        }
      }
    }
  } catch (e) {
    // Plazo del turno vencido a mitad: si ya hay texto, se usa lo que llegó.
    if (content.trim()) {
      console.warn(`[agent-llm] ${model}: respuesta cortada por tiempo (${content.length} caracteres)`);
      return { ok: true, data: { model: responseModel, content: `${content.trimEnd()}…`, toolCalls: [], usage }, firstTokenMs };
    }
    console.error(`[agent-llm] ${model}: el streaming se cortó: ${e instanceof Error ? e.message : String(e)}`);
    return fail(408, "stream_aborted");
  }
  const toolCalls: ChatToolCall[] = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, c]) => c.name)
    .map(([i, c]) => ({ id: c.id ?? `call_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } }));
  if (!content && toolCalls.length === 0) return fail(502, "empty_stream");
  return { ok: true, data: { model: responseModel, content, toolCalls, usage }, firstTokenMs };
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
  if (status === 408) return { code: "timeout", message: `El modelo ${model} no respondió a tiempo.` };
  if (status >= 500) return { code: "provider_error", message: `El modelo ${model} no respondió.` };
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
