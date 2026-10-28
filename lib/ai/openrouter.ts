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
  error?: { message?: string; code?: number };
}

/**
 * Adaptador OpenRouter (API compatible con chat completions). Solo corre en el servidor:
 * la clave nunca llega al navegador. Valida la salida con zod; si el JSON no valida,
 * reintenta una vez pidiendo corrección y si vuelve a fallar lanza AiUnavailableError.
 * Nunca sustituye la respuesta por una simulación.
 */
export class OpenRouterProvider implements AiProvider {
  readonly id = "openrouter" as const;
  readonly label: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_OPENROUTER_MODEL,
    private readonly appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ) {
    this.label = `OpenRouter · ${model}`;
  }

  async interpret(ctx: InterviewContext): Promise<AiResult> {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: renderContext(ctx) },
    ];

    let lastProblem = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const data = await this.call(messages);
      const raw = data.choices?.[0]?.message?.content ?? "";
      const parsed = safeJson(raw);
      const result = AiTurnSchema.safeParse(parsed);
      if (result.success) {
        return {
          turn: result.data,
          provider: "openrouter",
          usage: {
            model: data.model ?? this.model,
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
    throw new AiUnavailableError("invalid_output", `El modelo devolvió una respuesta inválida: ${lastProblem}`);
  }

  private async call(messages: Array<{ role: string; content: string }>): Promise<ChatResponse> {
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
          model: this.model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AiUnavailableError("provider_error", "No pudimos conectar con el proveedor de IA.");
    }
    if (res.status === 429) throw new AiUnavailableError("rate_limited", "El proveedor de IA alcanzó su límite de uso. Probá en unos minutos.");
    if (res.status === 401 || res.status === 403)
      throw new AiUnavailableError("not_configured", "La clave del proveedor de IA no es válida.");
    const data = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok || data.error) throw new AiUnavailableError("provider_error", "El proveedor de IA devolvió un error.");
    return data;
  }
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
