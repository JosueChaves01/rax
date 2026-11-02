/**
 * A qué servidor se le habla para cada modelo. Los ids con prefijo `local:` van al modelo que corre en
 * la PC propia (API compatible con OpenAI, publicada por Cloudflare Tunnel y protegida con Access);
 * el resto, a OpenRouter. El modelo local va primero y OpenRouter queda de respaldo.
 */

export const LOCAL_PREFIX = "local:";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** Espera por defecto al modelo local antes de pasar a OpenRouter (PC apagada, modelo cargando…). */
const DEFAULT_LOCAL_TIMEOUT_MS = 20_000;

export interface ResolvedEndpoint {
  url: string;
  headers: Record<string, string>;
  isLocal: boolean;
  /** Id que se envía al servidor (sin el prefijo `local:`). */
  model: string;
}

const env = (name: string) => process.env[name]?.trim() || "";

export function isLocalModel(model: string): boolean {
  return model.startsWith(LOCAL_PREFIX);
}

/** `local:<modelo>` si el modelo local está configurado; si no, null. */
export function localModelId(): string | null {
  const base = env("LOCAL_LLM_BASE_URL");
  const model = env("LOCAL_LLM_MODEL");
  return base && model ? `${LOCAL_PREFIX}${model}` : null;
}

/** Hay alguna IA real: OpenRouter, el modelo local o ambos. Sin ninguna se usa la simulación. */
export function hasLlmConfigured(): boolean {
  return Boolean(env("OPENROUTER_API_KEY") || localModelId());
}

/** El modelo local (si hay) delante de los de OpenRouter; sin clave de OpenRouter, solo el local. */
export function withLocalModel(models: string[], hasOpenRouterKey = Boolean(env("OPENROUTER_API_KEY"))): string[] {
  const local = localModelId();
  const remote = hasOpenRouterKey ? models.filter((m) => !isLocalModel(m)) : [];
  return [...new Set([...(local ? [local] : []), ...remote])];
}

export function localTimeoutMs(): number {
  const n = Number(env("LOCAL_LLM_TIMEOUT_MS"));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOCAL_TIMEOUT_MS;
}

export function resolveEndpoint(model: string, apiKey = env("OPENROUTER_API_KEY")): ResolvedEndpoint {
  if (isLocalModel(model)) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const key = env("LOCAL_LLM_API_KEY");
    if (key) headers.Authorization = `Bearer ${key}`;
    const id = env("CF_ACCESS_CLIENT_ID");
    const secret = env("CF_ACCESS_CLIENT_SECRET");
    if (id && secret) {
      headers["CF-Access-Client-Id"] = id;
      headers["CF-Access-Client-Secret"] = secret;
    }
    return {
      url: `${env("LOCAL_LLM_BASE_URL").replace(/\/+$/, "")}/chat/completions`,
      headers,
      isLocal: true,
      model: model.slice(LOCAL_PREFIX.length),
    };
  }
  return {
    url: OPENROUTER_ENDPOINT,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "RAX",
    },
    isLocal: false,
    model,
  };
}
