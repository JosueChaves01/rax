import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { createAgentThread } from "@/lib/services/agent-chat";
import { runAgentTurn } from "@/lib/services/agent-turn";
import { addAgentDocumentToProject, documentFromMessage, documentFromProject, documentTargets } from "@/lib/services/agent-documents";
import { assignMentor } from "@/lib/services/admin";
import { listProjectDocuments } from "@/lib/services/project-knowledge";
import { parseDocumentRequest } from "@/lib/ai/claude-orchestrator";
import { parseInline, parseMarkdown } from "@/lib/documents/markdown-blocks";
import { renderDocument } from "@/lib/documents";
import { toWinAnsi } from "@/lib/documents/render-pdf";
import { documentSlug } from "@/lib/documents/types";

afterAll(closeWorlds);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const SAMPLE = `# Guía de precios

Intro con **negrita**, *cursiva* y \`código\`.

## Pasos
1. Calcular costos
2. Revisar competencia
   - precios de 3 tiendas
3. Fijar precio

> Ojo: validar con clientes.

| Producto | Precio |
|---|---|
| Kit | 8 USD |

---
Cierre → próximos pasos ✓ 🚀`;

describe("Markdown → bloques", () => {
  it("reconoce títulos, listas anidadas, citas, tablas y separadores", () => {
    const blocks = parseMarkdown(SAMPLE);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "heading", "list", "quote", "table", "rule", "paragraph"]);
    const list = blocks[3];
    expect(list.type === "list" && list.ordered).toBe(true);
    expect(list.type === "list" && list.items.map((i) => i.depth)).toEqual([0, 0, 1, 0]);
    const table = blocks[5];
    expect(table.type === "table" && table.rows[0].map((c) => c[0].text)).toEqual(["Kit", "8 USD"]);
  });

  it("separa negrita, cursiva y código en línea", () => {
    expect(parseInline("a **b** *c* `d`")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", code: true },
    ]);
  });

  it("deja acentos y ñ para el PDF y reemplaza lo que sus fuentes no tienen", () => {
    expect(toWinAnsi("Año → señal ✓ 🚀 “ok”")).toBe("Año -> señal (ok)  “ok”");
    expect(documentSlug("Plan de estudio: SQL básico")).toBe("plan-de-estudio-sql-basico");
  });
});

describe("Archivos PDF y Word", () => {
  it("arma un PDF y un .docx válidos", async () => {
    const pdf = await renderDocument({ title: "Guía de precios", subtitle: "Huerta · 1 de noviembre de 2026", content: SAMPLE }, "pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.filename).toBe("guia-de-precios.pdf");
    const docx = await renderDocument({ title: "Guía de precios", content: SAMPLE }, "docx");
    expect(docx.body.subarray(0, 2).toString()).toBe("PK");
    expect(docx.mime).toContain("wordprocessingml");
  });
});

describe("Herramienta generate_document del agente", () => {
  it("redacta el documento con la IA, lo adjunta al mensaje y lo agrega al proyecto", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Huerta", description: "Kits de huerta urbana", nature: "exploring_idea" });
    const thread = await createAgentThread(ent, project.id, "Precios");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string } }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        bodies.push(body);
        const system = JSON.stringify(body.messages[0].content);
        let message: Record<string, unknown>;
        if (system.includes("redactor de documentos")) {
          message = { content: "## Introducción\n\nCómo fijar el precio del kit de huerta.\n\n## Pasos\n\n1. Costos\n2. Competencia\n\n## Próximos pasos\n\n- Probar con 5 clientes" };
        } else if (bodies.filter((b) => !JSON.stringify(b.messages[0].content).includes("redactor de documentos")).length === 1) {
          message = {
            content: "",
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "generate_document", arguments: JSON.stringify({ title: "Guía de precios", topic: "cómo fijar el precio del kit", format: "docx", add_to_project: true }) },
              },
            ],
          };
        } else {
          message = { content: "Te preparé la guía en Word con costos, competencia y próximos pasos." };
        }
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );

    const turn = await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "Hazme un Word con una guía para fijar el precio y guárdalo en el proyecto" });
    expect(bodies[0].tools?.map((t) => t.function.name)).toContain("generate_document");
    const writerCall = bodies.find((b) => JSON.stringify(b.messages[0].content).includes("redactor de documentos"));
    expect(JSON.stringify(writerCall?.messages[1].content)).toContain("Huerta");

    const [doc] = turn.result.artifacts;
    expect(doc.type).toBe("application/vnd.rax.document");
    expect(doc.format).toBe("docx");
    expect(doc.content).toContain("## Pasos");
    expect(doc.documentId).toBeTruthy();
    expect(turn.result.reply).toContain("Te preparé la guía");
    expect(turn.result.reply).toContain("agregué a los documentos del proyecto");

    const docs = await listProjectDocuments(ent, project.id);
    expect(docs.map((d) => d.filename)).toContain("guia-de-precios.docx");

    // Se descarga desde el mensaje (solo quien creó el hilo) y desde el conocimiento del proyecto.
    const fromMessage = await documentFromMessage(ent, turn.assistantMessage!.id, doc.id);
    expect(fromMessage.title).toBe("Guía de precios");
    expect(fromMessage.subtitle).toContain("Huerta");
    await expect(documentFromMessage(w.as("ent2"), turn.assistantMessage!.id, doc.id)).rejects.toThrow();
    const fromProject = await documentFromProject(ent, project.id, doc.documentId!);
    expect(fromProject.content).toContain("Costos");
    await expect(documentFromProject(w.as("ent2"), project.id, doc.documentId!)).rejects.toThrow();
  });

  it("sin IA, «genera un PDF sobre…» deja una plantilla descargable declarada como simulación", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Pan", description: "Panadería", nature: "exploring_idea" });
    const thread = await createAgentThread(ent, project.id, "Uno");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const turn = await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "Genera un PDF sobre el plan de ventas del pan integral" });
    const [doc] = turn.result.artifacts;
    expect(doc.format).toBe("pdf");
    expect(doc.title).toBe("El plan de ventas del pan integral");
    expect(doc.content).toContain("modo simulado");
    expect(doc.documentId).toBeUndefined();
    expect(await listProjectDocuments(ent, project.id)).toHaveLength(0);
  });

  it("entiende pedidos de documentos en lenguaje natural", () => {
    expect(parseDocumentRequest("hazme un word sobre marketing digital y guárdalo en el proyecto")).toEqual({
      title: "Marketing digital",
      topic: "marketing digital",
      format: "docx",
      addToProject: true,
    });
    expect(parseDocumentRequest("¿qué es un PDF?")).toBeNull();
  });
});

describe("Agregar un documento ya generado a un proyecto del mentor", () => {
  /** Simula la IA: cada turno del agente usa la herramienta indicada y luego responde con texto. */
  function stubAgent(script: Array<{ name: string; args: Record<string, unknown> }>) {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const toolResults: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const system = JSON.stringify(body.messages[0].content);
        let message: Record<string, unknown>;
        if (system.includes("redactor de documentos")) {
          message = { content: "## Agenda\n\n- Revisar precios y costos del producto\n\n## Acuerdos\n\n- Probar con 5 clientes antes de la próxima sesión de mentoría" };
        } else if (body.messages.at(-1).role === "tool") {
          toolResults.push(String(body.messages.at(-1).content));
          message = { content: "Listo." };
        } else {
          const call = script.shift()!;
          message = { content: "", tool_calls: [{ id: `c${script.length}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } }] };
        }
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );
    return toolResults;
  }

  async function setup() {
    const w = await world();
    const admin = w.as("adm");
    const a = await createProject(w.as("ent1"), { name: "Huerta Urbana", description: "Kits de huerta", nature: "exploring_idea" });
    const b = await createProject(w.as("ent2"), { name: "Café Verde", description: "Café de especialidad", nature: "exploring_idea" });
    const c = await createProject(w.as("ent2"), { name: "Pan Integral", description: "Panadería", nature: "exploring_idea" });
    await assignMentor(admin, a.id, w.id("men1"));
    await assignMentor(admin, b.id, w.id("men1"));
    const men = w.as("men1");
    const thread = await createAgentThread(men, a.id, "Preparar sesión");
    return { w, men, a, b, c, thread };
  }

  it("el mentor lo pide en el chat y queda en el proyecto que eligió; si no dice cuál, le pregunta", async () => {
    const { w, men, a, b, thread } = await setup();
    const results = stubAgent([
      { name: "generate_document", args: { title: "Guía de sesión", topic: "agenda y acuerdos", add_to_project: false } },
      { name: "add_document_to_project", args: {} },
      { name: "add_document_to_project", args: { project: "cafe verde" } },
    ]);
    const first = await runAgentTurn(men, { projectId: a.id, threadId: thread.id, message: "Hazme un PDF con la guía de la sesión" });
    expect(first.result.artifacts[0].documentId).toBeUndefined();

    await runAgentTurn(men, { projectId: a.id, threadId: thread.id, message: "Agrégalo a un proyecto" });
    expect(results.at(-1)).toContain("needs_choice");
    expect(results.at(-1)).toContain("Huerta Urbana (proyecto actual)");
    expect(results.at(-1)).toContain("Café Verde");
    expect(results.at(-1)).not.toContain("Pan Integral");

    const tools = await runAgentTurn(men, { projectId: a.id, threadId: thread.id, message: "A Café Verde" });
    expect(tools.result.reply).toBeTruthy();
    expect(results.at(-1)).toContain('"ok":true');
    const inB = await listProjectDocuments(w.as("ent2"), b.id);
    expect(inB.map((d) => d.title)).toEqual(["Guía de sesión"]);
    expect(inB[0].content).toContain("## Acuerdos");
    expect(await listProjectDocuments(w.as("ent1"), a.id)).toHaveLength(0);
  });

  it("desde la tarjeta: solo proyectos asignados, sin duplicar y solo quien creó el hilo", async () => {
    const { w, men, a, b, c, thread } = await setup();
    stubAgent([{ name: "generate_document", args: { title: "Plan de trabajo", topic: "plan", add_to_project: true } }]);
    const turn = await runAgentTurn(men, { projectId: a.id, threadId: thread.id, message: "Genera un PDF con el plan" });
    const messageId = turn.assistantMessage!.id;
    const [doc] = turn.result.artifacts;

    const targets = await documentTargets(men, messageId, doc.id);
    expect(targets.map((t) => [t.name, t.current, t.saved])).toEqual([
      ["Huerta Urbana", true, true],
      ["Café Verde", false, false],
    ]);

    const again = await addAgentDocumentToProject(men, { messageId, artifactId: doc.id, projectId: a.id });
    expect(again.alreadySaved).toBe(true);
    expect(await listProjectDocuments(w.as("ent1"), a.id)).toHaveLength(1);

    const saved = await addAgentDocumentToProject(men, { messageId, artifactId: doc.id, projectId: b.id });
    expect(saved.alreadySaved).toBe(false);
    expect(saved.placement.projectName).toBe("Café Verde");
    const twice = await addAgentDocumentToProject(men, { messageId, artifactId: doc.id, projectId: b.id });
    expect(twice.alreadySaved).toBe(true);
    expect(await listProjectDocuments(w.as("ent2"), b.id)).toHaveLength(1);
    expect((await documentTargets(men, messageId, doc.id)).every((t) => t.saved)).toBe(true);

    // Proyecto sin asignación, otro mentor o el emprendedor no pueden usar el documento del hilo del mentor.
    await expect(addAgentDocumentToProject(men, { messageId, artifactId: doc.id, projectId: c.id })).rejects.toThrow();
    await expect(addAgentDocumentToProject(w.as("men2"), { messageId, artifactId: doc.id, projectId: b.id })).rejects.toThrow();
    await expect(addAgentDocumentToProject(w.as("ent2"), { messageId, artifactId: doc.id, projectId: b.id })).rejects.toThrow();
    expect(await listProjectDocuments(w.as("ent2"), c.id)).toHaveLength(0);
  });
});
