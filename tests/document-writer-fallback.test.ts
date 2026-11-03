import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatWithFallback, resetModelHealth } from "@/lib/ai/openrouter-chat";

beforeEach(() => resetModelHealth());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("respuestas vacías al redactar un documento", () => {
  it("un modelo que responde vacío (gastó los tokens razonando) cede el turno al siguiente", async () => {
    const tried: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const { model } = JSON.parse(options?.body as string) as { model: string };
        tried.push(model);
        if (model === "razonador") return new Response(JSON.stringify({ model, choices: [{ message: { content: "" }, finish_reason: "length" }] }), { status: 200 });
        return new Response(JSON.stringify({ model, choices: [{ message: { content: "## Ejercicio 1\n\n".padEnd(200, "x") }, finish_reason: "stop" }] }), { status: 200 });
      }),
    );
    const res = await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["razonador", "escritor"], minContentChars: 80 });
    expect(tried).toEqual(["razonador", "escritor"]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.completion.model).toBe("escritor");
      expect(res.completion.finishReason).toBe("stop");
    }
    expect(res.trace.failedModels).toEqual(["razonador"]);
  });

  it("sin mínimo pedido, una respuesta corta sigue siendo válida (el chat normal no cambia)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ model: "a", choices: [{ message: { content: "ok" } }] }), { status: 200 })));
    const res = await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["a"] });
    expect(res.ok).toBe(true);
  });

  it("si todos responden vacío, falla con un mensaje claro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ model: "a", choices: [{ message: { content: null } }] }), { status: 200 })));
    const res = await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["a", "b"], minContentChars: 80 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.message).toMatch(/vacía/);
    expect(res.trace.failedModels).toEqual(["a", "b"]);
  });
});
