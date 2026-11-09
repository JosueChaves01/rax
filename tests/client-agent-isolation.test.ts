import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn } from "@/lib/services/agent-turn";
import { BETO, CAMI, MARA, OUTSIDER, PID, b2bWorld, code } from "./fixtures/b2b-world";

/**
 * Fase 4 · riesgo del plan (§5): «el cliente accede a material del mentor no publicado vía el agente».
 * Un turno del asistente de una persona cliente nunca lleva al modelo un documento «solo mentor» (ni el
 * publicado para otra persona del grupo), ni en el contexto ni a través de herramientas.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const SECRET = "SECRETO-DEL-MENTOR";
const OTHERS = "SOLO-PARA-BETO";

async function seeded() {
  const w = await b2bWorld("group", [CAMI, BETO]);
  await w.doc("doc_guia", { title: "Guía de margen", visibility: "published", publishedAt: "2026-11-05T00:00:00.000Z", content: "PUBLICADO: el margen es precio menos costo." });
  await w.doc("doc_beto", { title: "Plan de Beto", visibility: "published", publishedAt: "2026-11-06T00:00:00.000Z", audienceClientId: BETO.id, content: OTHERS });
  await w.doc("doc_secreto", { title: "Notas del mentor", content: `${SECRET}: el cliente subestima sus costos.` });
  for (const id of ["doc_guia", "doc_beto", "doc_secreto"]) {
    const doc = (await w.repo.projectDocuments.get(id))!;
    await w.repo.projectDocumentChunks.insert({ id: `chk_${id}`, projectId: PID, documentId: id, chunkIndex: 0, content: doc.content, tokenCount: 10, createdAt: doc.createdAt });
  }
  return w;
}

/** Modelo falso: la primera vuelta pide leer el documento secreto; la segunda responde. */
function fakeModel() {
  const bodies: string[] = [];
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options?: RequestInit) => {
      const raw = options?.body as string;
      bodies.push(raw);
      const message =
        bodies.length === 1
          ? {
              content: "",
              tool_calls: [
                { id: "c1", type: "function", function: { name: "read_project_document", arguments: JSON.stringify({ document: "Notas del mentor" }) } },
                { id: "c2", type: "function", function: { name: "explain_resource", arguments: JSON.stringify({ title: "Notas del mentor" }) } },
              ],
            }
          : { content: "Te explico la guía de margen." };
      return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
    }),
  );
  return bodies;
}

describe("asistente del cliente en un proyecto B2B", () => {
  it("el turno de una persona cliente nunca ve documentos «solo mentor» ni los de otra persona", async () => {
    vi.stubEnv("RAX_B2B_FLOW", "on");
    const w = await seeded();
    const bodies = fakeModel();
    const turn = await runAgentTurn(w.as(CAMI), { projectId: PID, message: "Explícame mis costos y el margen" });
    expect(turn.result.reply).toBe("Te explico la guía de margen.");
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    const all = bodies.join("\n");
    expect(all).toContain("PUBLICADO: el margen es precio menos costo.");
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(OTHERS);
    // Las citas que guarda el mensaje tampoco nombran el documento secreto.
    expect(JSON.stringify(turn.assistantMessage)).not.toContain("doc_secreto");
  });

  it("control: el turno del mentor sí conoce sus documentos «solo mentor»", async () => {
    vi.stubEnv("RAX_B2B_FLOW", "on");
    const w = await seeded();
    const bodies = fakeModel();
    await runAgentTurn(w.as(MARA), { projectId: PID, message: "¿Qué anoté de sus costos?" });
    expect(bodies[0]).toContain(SECRET);
  });

  it("sin la bandera, la persona cliente no tiene asistente (como antes); alguien ajeno nunca", async () => {
    const w = await seeded();
    expect(await code(runAgentTurn(w.as(CAMI), { projectId: PID, message: "Hola" }))).toBe("forbidden");
    vi.stubEnv("RAX_B2B_FLOW", "on");
    expect(await code(runAgentTurn(w.as(OUTSIDER), { projectId: PID, message: "Hola" }))).toBe("not_found");
  });
});
