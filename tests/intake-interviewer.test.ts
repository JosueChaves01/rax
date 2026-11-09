import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetModelHealth } from "@/lib/ai/openrouter-chat";
import {
  buildInterviewerPrompt,
  classifyAnswer,
  generateIntakeBrief,
  intakeModeFor,
  parseInterviewerOutput,
  runInterviewerTurn,
} from "@/lib/ai/intake-interviewer";
import { AiUnavailableError } from "@/lib/ai/provider";
import { fakeBuildMentorContext, SAMPLE_INTERVIEW_GUIDE } from "./fixtures/b2b";
import { createMemoryRepository } from "@/lib/data/memory-repository";

const guide = SAMPLE_INTERVIEW_GUIDE;

beforeEach(() => resetModelHealth());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Respuestas en orden de un OpenRouter falso; registra qué modelo se pidió en cada llamada. */
function fakeOpenRouter(replies: Array<(model: string, body: Record<string, unknown>) => Record<string, unknown>>) {
  const tried: string[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options?: RequestInit) => {
      const body = JSON.parse(options?.body as string) as Record<string, unknown>;
      tried.push(body.model as string);
      const make = replies[Math.min(i++, replies.length - 1)];
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: make(body.model as string, body), finish_reason: "stop" }] }), { status: 200 });
    }),
  );
  return tried;
}

describe("prompt del entrevistador", () => {
  it("lleva la guía, la cobertura y el contexto del mentor", async () => {
    const mentorContext = await fakeBuildMentorContext(createMemoryRepository(), "u_mara", "x");
    const prompt = buildInterviewerPrompt({ projectName: "Panadería", clientName: "Cami", mentorName: "Mara", assistantTone: "Cercano", guide, coverage: { q_negocio: "answered" }, mentorContext });
    expect(prompt).toContain("[q_negocio] (Negocio, obligatoria) ¿Qué vendes y a quién?");
    expect(prompt).toContain("- q_negocio: answered");
    expect(prompt).toContain("- q_dolor: pendiente");
    expect(prompt).toContain("Obligatorias pendientes: q_dolor");
    expect(prompt).toContain("<mentor_context>");
    expect(prompt).toContain("Método de los tres números");
    expect(prompt).toMatch(/Una sola pregunta por mensaje/);
    expect(prompt).toMatch(/de tú/);
  });

  it("sin IA configurada se usa la simulación", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("LOCAL_LLM_BASE_URL", "");
    expect(intakeModeFor({ id: "openrouter" })).toBe("simulated");
    expect(intakeModeFor({ id: "simulated" })).toBe("simulated");
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    expect(intakeModeFor({ id: "openrouter" })).toBe("openrouter");
  });
});

describe("lectura de la salida del modelo", () => {
  it("toma la cobertura de las herramientas e ignora ids fuera de la guía", () => {
    const out = parseInterviewerOutput(
      "¡Gracias! ¿Qué te quita el sueño?",
      [
        { function: { name: "record_intake_answer", arguments: JSON.stringify({ question_id: "q_negocio", status: "answered", answer: "Pan" }) } },
        { function: { name: "record_intake_answer", arguments: JSON.stringify({ question_id: "q_otro", status: "answered" }) } },
        { function: { name: "record_intake_answer", arguments: "{roto" } },
      ],
      guide,
    );
    expect(out).toEqual({ reply: "¡Gracias! ¿Qué te quita el sueño?", updates: [{ questionId: "q_negocio", status: "answered", answer: "Pan" }], finished: false });
  });

  it("acepta un bloque JSON al final (modelos sin herramientas) y lo quita del texto", () => {
    const content = 'Perfecto, gracias.\n\n```json\n{"coverage":[{"questionId":"q_dolor","status":"partial"},{"questionId":"q_numeros","status":"inventado"}],"finished":true}\n```';
    const out = parseInterviewerOutput(content, [], guide);
    expect(out.reply).toBe("Perfecto, gracias.");
    expect(out.updates).toEqual([{ questionId: "q_dolor", status: "partial" }]);
    expect(out.finished).toBe(true);
    const bare = parseInterviewerOutput('Bien. {"coverage":[{"questionId":"q_negocio","status":"skipped"}]}', [], guide);
    expect(bare).toMatchObject({ reply: "Bien.", updates: [{ questionId: "q_negocio", status: "skipped" }] });
  });

  it("clasifica respuestas en la simulación", () => {
    expect(classifyAnswer("No sé")).toBe("skipped");
    expect(classifyAnswer("Pan")).toBe("partial");
    expect(classifyAnswer("Pan artesanal para las familias del barrio")).toBe("answered");
  });
});

describe("con IA real (OpenRouter falso)", () => {
  const base = {
    mode: "openrouter" as const,
    projectName: "Panadería",
    clientName: "Cami Brenes",
    mentorName: "Mara",
    guide,
    coverage: {},
    mentorContext: { text: "", citations: [] },
  };

  it("si el modelo solo llama a la herramienta, le pide el texto en una segunda vuelta", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "m1");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    fakeOpenRouter([
      () => ({ content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "record_intake_answer", arguments: '{"question_id":"q_negocio","status":"answered"}' } }] }),
      (_m, body) => {
        expect(body.tool_choice).toBe("none");
        return { content: "¡Gracias! ¿Qué te quita el sueño hoy del negocio?" };
      },
    ]);
    const turn = await runInterviewerTurn({ ...base, transcript: [{ role: "interviewer", content: "¿Qué vendes y a quién?" }, { role: "client", content: "Pan para el barrio." }] });
    expect(turn).toMatchObject({ provider: "openrouter", model: "m1", reply: "¡Gracias! ¿Qué te quita el sueño hoy del negocio?", updates: [{ questionId: "q_negocio", status: "answered" }] });
  });

  it("el brief prueba el siguiente modelo si uno devuelve JSON inválido", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "malo");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "bueno");
    const good = {
      summary: "Panadería de barrio con caja apretada a fin de mes y dudas sobre el margen de la repostería.",
      answers: [{ questionId: "q_negocio", answer: "Pan y repostería para el barrio.", confidence: "high" }, { questionId: "q_fantasma", answer: "x", confidence: "low" }],
      gaps: ["Ventas mensuales"],
      risks: [],
      suggestedAgenda: [{ title: "Margen por producto", goal: "Saber qué deja dinero" }],
      citedDocuments: ["Método de los tres números"],
    };
    const tried = fakeOpenRouter([
      (model) => ({ content: model === "malo" ? '{"resumen": "no es el formato pedido, aunque tiene texto suficiente para pasar el mínimo de caracteres"}' : JSON.stringify(good) }),
    ]);
    const mentorContext = await fakeBuildMentorContext(createMemoryRepository(), "u_mara", "x");
    const brief = await generateIntakeBrief({ ...base, mentorContext, transcript: [], now: "2026-11-09T00:00:00.000Z" });
    expect(tried).toEqual(["malo", "bueno"]);
    expect(brief.model).toBe("bueno");
    expect(brief.answers).toEqual([{ questionId: "q_negocio", topic: "Negocio", answer: "Pan y repostería para el barrio.", confidence: "high" }]);
    expect(brief.suggestedAgenda).toEqual([{ id: "t_1", title: "Margen por producto", goal: "Saber qué deja dinero", status: "planned" }]);
    expect(brief.citations?.map((c) => c.documentId)).toEqual(["mdoc_metodo"]);
  });

  it("si ningún modelo devuelve un brief válido, falla sin inventar uno", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "a");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "b");
    fakeOpenRouter([() => ({ content: "Lo siento, no puedo hacer eso en formato JSON pero aquí va un texto largo de relleno." })]);
    const err = await generateIntakeBrief({ ...base, transcript: [], now: "2026-11-09T00:00:00.000Z" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect((err as AiUnavailableError).reason).toBe("invalid_output");
  });
});
