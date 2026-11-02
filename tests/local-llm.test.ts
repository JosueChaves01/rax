import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasLlmConfigured, resolveEndpoint, withLocalModel } from "@/lib/ai/endpoints";
import { agentModels, chatWithFallback, resetModelHealth } from "@/lib/ai/openrouter-chat";
import { OpenRouterProvider } from "@/lib/ai/openrouter";

beforeEach(() => {
  resetModelHealth();
  for (const name of ["OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_FALLBACK_MODELS", "CLAUDE_PROJECTS_MODEL", "CLAUDE_MODEL", "LOCAL_LLM_BASE_URL", "LOCAL_LLM_MODEL", "LOCAL_LLM_API_KEY", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET", "LOCAL_LLM_TIMEOUT_MS"]) {
    vi.stubEnv(name, "");
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function useLocal() {
  vi.stubEnv("LOCAL_LLM_BASE_URL", "https://llm.example.com/v1/");
  vi.stubEnv("LOCAL_LLM_MODEL", "prism-ml/bonsai-27b");
}

const okBody = (content: string) =>
  new Response(JSON.stringify({ model: "x", choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });

describe("resolveEndpoint", () => {
  it("manda los modelos local: al servidor local con las cabeceras de Access y sin el prefijo", () => {
    useLocal();
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "id.access");
    vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "secreto");
    const ep = resolveEndpoint("local:prism-ml/bonsai-27b", "or-key");
    expect(ep).toMatchObject({ url: "https://llm.example.com/v1/chat/completions", isLocal: true, model: "prism-ml/bonsai-27b" });
    expect(ep.headers).toMatchObject({ "CF-Access-Client-Id": "id.access", "CF-Access-Client-Secret": "secreto" });
    expect(ep.headers.Authorization).toBeUndefined();
    expect(ep.headers["HTTP-Referer"]).toBeUndefined();
    expect(ep.headers["X-Title"]).toBeUndefined();
  });

  it("solo envía Authorization al modelo local si hay LOCAL_LLM_API_KEY", () => {
    useLocal();
    vi.stubEnv("LOCAL_LLM_API_KEY", "lm-key");
    expect(resolveEndpoint("local:prism-ml/bonsai-27b").headers.Authorization).toBe("Bearer lm-key");
  });

  it("el resto sigue yendo a OpenRouter", () => {
    const ep = resolveEndpoint("meta-llama/llama-3.3-70b-instruct:free", "or-key");
    expect(ep).toMatchObject({ url: "https://openrouter.ai/api/v1/chat/completions", isLocal: false });
    expect(ep.headers.Authorization).toBe("Bearer or-key");
  });
});

describe("orden de modelos", () => {
  it("pone el local primero y OpenRouter de respaldo", () => {
    useLocal();
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("OPENROUTER_MODEL", "a:free");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "b:free");
    expect(agentModels()).toEqual(["local:prism-ml/bonsai-27b", "a:free", "b:free"]);
    expect(new OpenRouterProvider("or-key", "a:free", ["b:free"]).label).toBe("Local · prism-ml/bonsai-27b");
  });

  it("sin clave de OpenRouter, solo el local", () => {
    useLocal();
    expect(withLocalModel(["a:free"])).toEqual(["local:prism-ml/bonsai-27b"]);
    expect(hasLlmConfigured()).toBe(true);
  });

  it("sin modelo local, igual que antes", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("OPENROUTER_MODEL", "a:free");
    expect(agentModels()).toEqual(["a:free"]);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(hasLlmConfigured()).toBe(false);
  });
});

describe("chatWithFallback con el modelo local", () => {
  it("el payload local no lleva campos propios de OpenRouter y conserva tools y streaming", async () => {
    useLocal();
    const fetchMock = vi.fn(async () => okBody("hola"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await chatWithFallback({
      messages: [
        { role: "system", content: [{ type: "text", text: "Sistema", cache_control: { type: "ephemeral" } }] },
        { role: "user", content: "Hola" },
      ],
      tools: [{ type: "function", function: { name: "t", parameters: {} } }],
      onDelta: () => {},
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.completion.model).toBe("local:prism-ml/bonsai-27b");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect(init.redirect).toBe("error");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("prism-ml/bonsai-27b");
    expect(body).not.toHaveProperty("cache_control");
    expect(body).not.toHaveProperty("usage");
    expect(body.stream).toBe(true);
    expect(body.tools).toHaveLength(1);
    expect(body.messages[0].content).toBe("Sistema");
    expect(init.headers).not.toHaveProperty("HTTP-Referer");
  });

  it("si la PC está apagada cae a OpenRouter y no reintenta el local en el siguiente turno", async () => {
    useLocal();
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("OPENROUTER_MODEL", "a:free");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://llm.example.com")) return new Response("tunnel down", { status: 530 });
      return okBody("desde OpenRouter");
    });
    vi.stubGlobal("fetch", fetchMock);
    const messages = [{ role: "user" as const, content: "Hola" }];

    const first = await chatWithFallback({ messages });
    expect(first.ok && first.completion.content).toBe("desde OpenRouter");
    expect(first.trace.failedModels).toEqual(["local:prism-ml/bonsai-27b"]);

    fetchMock.mockClear();
    await chatWithFallback({ messages });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("un 401/403 del local (Access mal configurado) no corta el respaldo", async () => {
    useLocal();
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("OPENROUTER_MODEL", "a:free");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("https://llm") ? new Response("forbidden", { status: 403 }) : okBody("ok"))));
    const res = await chatWithFallback({ messages: [{ role: "user", content: "Hola" }] });
    expect(res.ok).toBe(true);
  });

  it("si el local rechaza herramientas, reintenta sin ellas", async () => {
    useLocal();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      JSON.parse(String(init.body)).tools
        ? new Response(JSON.stringify({ error: { message: "tools are not supported", code: 400 } }), { status: 400 })
        : okBody("sin herramientas"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await chatWithFallback({ messages: [{ role: "user", content: "Hola" }], tools: [{ type: "function", function: { name: "t" } }] });
    expect(res.ok && res.completion.content).toBe("sin herramientas");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("modo JSON con el modelo local", () => {
  it("no envía response_format json_object (Bionic/LM Studio lo rechazan)", async () => {
    useLocal();
    const fetchMock = vi.fn(async () => okBody('{"a":1}'));
    vi.stubGlobal("fetch", fetchMock);
    await chatWithFallback({ messages: [{ role: "user", content: "JSON" }], jsonMode: true });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).not.toHaveProperty("response_format");
  });

  it("entiende el error como texto de LM Studio y adapta sin herramientas", async () => {
    useLocal();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      JSON.parse(String(init.body)).tools ? new Response(JSON.stringify({ error: "tools not supported by this model" }), { status: 400 }) : okBody("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await chatWithFallback({ messages: [{ role: "user", content: "Hola" }], tools: [{ type: "function", function: { name: "t" } }] });
    expect(res.ok && res.completion.content).toBe("ok");
  });
});
