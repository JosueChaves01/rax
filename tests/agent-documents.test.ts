import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { createAgentThread } from "@/lib/services/agent-chat";
import { runAgentTurn } from "@/lib/services/agent-turn";
import { documentFromMessage, documentFromProject } from "@/lib/services/agent-documents";
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
