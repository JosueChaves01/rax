import "server-only";
import { AiTurnSchema } from "./schema";
import { AiUnavailableError, type AiProvider, type AiResult, type InterviewContext } from "./provider";
import { renderContext, SYSTEM_PROMPT } from "./prompt";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Modelo gratuito por defecto; se cambia con OPENROUTER_MODEL sin tocar código. */
export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 2;

interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number; metadata?: { provider_name?: string; raw?: unknown } };
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Fallo de una llamada a un modelo concreto. `retryOther` = tiene sentido probar el siguiente modelo. */
class ModelFailure extends Error {
  constructor(
    readonly reason: AiUnavailableError["reason"],
    readonly userMessage: string,
    readonly retryOther: boolean,
  ) {
    super(userMessage);
  }
}

/**
 * Adaptador OpenRouter (API compatible con chat completions). Solo corre en el servidor:
 * la clave nunca llega al navegador. Valida la salida con zod; si el JSON no valida,
 * reintenta una vez pidiendo corrección y si vuelve a fallar lanza AiUnavailableError.
 * Nunca sustituye la respuesta por una simulación.
 *
 * Los modelos gratuitos se saturan seguido (429 del proveedor de origen), así que se prueban en orden
 * el modelo principal y los de respaldo (OPENROUTER_FALLBACK_MODELS). También se adapta a modelos que
 * no aceptan instrucciones de sistema o el modo JSON. El detalle real del error queda en el log del servidor.
 */
export class OpenRouterProvider implements AiProvider {
  readonly id = "openrouter" as const;
  readonly label: string;
  private readonly models: string[];

  constructor(
    private readonly apiKey: string,
    model: string = DEFAULT_OPENROUTER_MODEL,
    fallbacks: string[] = [],
    private readonly appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ) {
    this.models = [...new Set([model, ...fallbacks].map((m) => m.trim()).filter(Boolean))];
    this.label = `OpenRouter · ${this.models[0]}`;
  }

  async interpret(ctx: InterviewContext): Promise<AiResult> {
    const base: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: renderContext(ctx) },
    ];
    let last: ModelFailure | null = null;
    for (const model of this.models) {
      try {
        return await this.interpretWith(model, base);
      } catch (e) {
        if (!(e instanceof ModelFailure)) throw e;
        last = e;
        if (!e.retryOther) break;
      }
    }
    const tried = this.models.length > 1 ? ` (probamos ${this.models.length} modelos)` : "";
    throw new AiUnavailableError(last?.reason ?? "provider_error", (last?.userMessage ?? "El proveedor de IA devolvió un error.") + tried);
  }

  private async interpretWith(model: string, base: ChatMessage[]): Promise<AiResult> {
    const messages = [...base];
    const opts = { mergeSystem: false, jsonMode: true };
    let lastProblem = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const data = await this.callAdapting(model, messages, opts);
      const raw = data.choices?.[0]?.message?.content ?? "";
      const parsed = safeJson(raw);
      const result = AiTurnSchema.safeParse(parsed);
      if (result.success) {
        return {
          turn: result.data,
          provider: "openrouter",
          usage: {
            model: data.model ?? model,
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
          },
        };
      }
      lastProblem = result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      messages.push(
        { role: "assistant", content: raw.slice(0, 4000) },
        { role: "user", content: `Tu respuesta no cumple el esquema (${lastProblem}). Respondé solo con el JSON corregido.` },
      );
    }
    console.error(`[openrouter] ${model}: salida inválida tras ${MAX_ATTEMPTS} intentos: ${lastProblem}`);
    throw new ModelFailure("invalid_output", `El modelo devolvió una respuesta inválida: ${lastProblem}`, true);
  }

  /** Llama al modelo y, si rechaza instrucciones de sistema o el modo JSON, reintenta sin ellos. */
  private async callAdapting(model: string, messages: ChatMessage[], opts: { mergeSystem: boolean; jsonMode: boolean }): Promise<ChatResponse> {
    for (;;) {
      const outcome = await this.call(model, opts.mergeSystem ? mergeSystem(messages) : messages, opts.jsonMode);
      if (outcome.ok) return outcome.data;
      const { status, detail } = outcome;
      if (!opts.mergeSystem && (status === 400 || status === 422) && /system|developer instruction/i.test(detail)) {
        opts.mergeSystem = true;
        continue;
      }
      if (opts.jsonMode && (status === 400 || status === 404 || status === 422) && /response_format|json|support the requested parameters/i.test(detail)) {
        opts.jsonMode = false;
        continue;
      }
      throw classify(model, status, detail);
    }
  }

  private async call(
    model: string,
    messages: ChatMessage[],
    jsonMode: boolean,
  ): Promise<{ ok: true; data: ChatResponse } | { ok: false; status: number; detail: string }> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.appUrl,
          "X-Title": "RAX",
        },
        body: JSON.stringify({
          model,
          messages,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      console.error(`[openrouter] ${model}: sin conexión: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, status: 0, detail: "network" };
    }
    const data = (await res.json().catch(() => ({}))) as ChatResponse;
    // OpenRouter puede responder 200 con un objeto `error` (falla del proveedor de origen).
    const status = data.error ? data.error.code || res.status : res.status;
    if (res.ok && !data.error) return { ok: true, data };
    const raw = data.error?.metadata?.raw;
    const detail = [data.error?.message, data.error?.metadata?.provider_name, typeof raw === "string" ? raw : raw ? JSON.stringify(raw) : ""]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 600);
    // Nunca se registra la clave ni el contenido de la conversación: solo estado y mensaje del proveedor.
    console.error(`[openrouter] ${model}: HTTP ${status}: ${detail || "(sin detalle)"}`);
    return { ok: false, status, detail };
  }
}

/** Traduce el error del proveedor a un motivo y un mensaje claro para la persona. */
function classify(model: string, status: number, detail: string): ModelFailure {
  if (status === 0) return new ModelFailure("provider_error", "No pudimos conectar con el proveedor de IA.", true);
  if (status === 401) return new ModelFailure("not_configured", "La clave de OpenRouter no es válida.", false);
  if (status === 402) return new ModelFailure("rate_limited", "La cuenta de OpenRouter no tiene saldo para este modelo.", true);
  if (status === 429) {
    if (/per[- ]day|free-models-per|daily/i.test(detail))
      return new ModelFailure("rate_limited", "Se agotó el cupo diario de modelos gratuitos de OpenRouter para esta cuenta. Se renueva cada día.", false);
    return new ModelFailure("rate_limited", `El modelo gratuito ${model} está saturado en este momento. Probá en unos minutos.`, true);
  }
  if (status === 403) return new ModelFailure("refused", "El proveedor de IA rechazó el mensaje (moderación).", true);
  if (status === 404) return new ModelFailure("provider_error", `El modelo ${model} no existe o no está disponible en OpenRouter.`, true);
  if (status === 408 || status >= 500) return new ModelFailure("provider_error", `El modelo ${model} no respondió a tiempo.`, true);
  return new ModelFailure("provider_error", `El proveedor de IA devolvió un error (${status}).`, true);
}

/** Para modelos que no aceptan rol de sistema: las instrucciones van al inicio del primer mensaje. */
function mergeSystem(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  if (!system || rest.length === 0) return rest;
  const [first, ...others] = rest;
  return [{ ...first, content: `${system}\n\n---\n\n${first.content}` }, ...others];
}

function safeJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
