import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import {
  addMentorDocument,
  deleteMentorDocument,
  getMentorKnowledgeContext,
  importMentorResourcesToKnowledge,
  listMentorDocuments,
} from "@/lib/services/mentor-knowledge";
import { saveMentorProfile } from "@/lib/services/mentor-profile";
import { buildMentorContext } from "@/lib/ai/mentor-context";
import { createResource } from "@/lib/services/resources";

afterAll(closeWorlds);

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e);

const METHOD = "# Método de los tres números\nVentas, margen y caja: revísalos cada semana antes de hablar de crecimiento.";

describe("conocimiento del mentor (Fase 1, Dev A)", () => {
  it("agrega documentos con tokens y fragmentos, los lista y los borra", async () => {
    const w = await world();
    const men = w.as("men1");
    const doc = await addMentorDocument(men, { title: "Método", filename: "metodo.md", content: METHOD, fileType: "markdown", kind: "methodology" });
    expect(doc.mentorId).toBe(w.id("men1"));
    expect(doc.tokenCount).toBeGreaterThan(0);
    const chunks = await w.repo.mentorDocumentChunks.list({ documentId: doc.id });
    expect(chunks.length).toBeGreaterThan(0);

    const listed = await listMentorDocuments(men);
    expect(listed.map((d) => d.id)).toEqual([doc.id]);
    expect(listed[0]).not.toHaveProperty("content");

    expect((await errorOf(deleteMentorDocument(w.as("men2"), doc.id)))?.code).toBe("not_found");
    await deleteMentorDocument(men, doc.id);
    expect(await listMentorDocuments(men)).toEqual([]);
    expect((await w.repo.mentorDocumentChunks.list({ documentId: doc.id })).every((c) => c.content === "")).toBe(true);
    expect((await errorOf(deleteMentorDocument(men, doc.id)))?.code).toBe("not_found");
  });

  it("valida la entrada y exige rol de mentor", async () => {
    const w = await world();
    const base = { title: "Método", filename: "m.md", content: METHOD, fileType: "markdown", kind: "methodology" as const };
    expect((await errorOf(addMentorDocument(w.as("ent1"), base)))?.code).toBe("forbidden");
    expect((await errorOf(addMentorDocument(w.as("men1"), { ...base, content: "  " })))?.code).toBe("validation");
    expect((await errorOf(addMentorDocument(w.as("men1"), { ...base, kind: "otro" as never })))?.code).toBe("validation");
    expect((await addMentorDocument(w.as("men1"), { ...base, fileType: "exe" })).fileType).toBe("markdown");
  });

  it("el contexto usa documentos completos si caben y fragmentos si no, solo del mentor indicado", async () => {
    const w = await world();
    const men = w.as("men1");
    const doc = await addMentorDocument(men, { title: "Método", filename: "metodo.md", content: METHOD, fileType: "markdown", kind: "methodology" });
    await addMentorDocument(w.as("men2"), { title: "Ajeno", filename: "ajeno.md", content: "Otro mentor, otra caja.", fileType: "markdown", kind: "reference" });

    const inContext = await getMentorKnowledgeContext(w.repo, w.id("men1"), "caja");
    expect(inContext.mode).toBe("in_context");
    expect(inContext.inContextDocs?.map((d) => d.id)).toEqual([doc.id]);
    expect(inContext.citations[0].documentId).toBe(doc.id);

    const longText = Array.from({ length: 60 }, (_, i) => `Párrafo ${i}: ${i === 42 ? "el inventario rotativo se cuenta los lunes" : "texto de relleno sobre el negocio"}.`).join("\n\n");
    await addMentorDocument(men, { title: "Operación", filename: "operacion.md", content: longText, fileType: "markdown", kind: "reference" });
    const rag = await getMentorKnowledgeContext(w.repo, w.id("men1"), "inventario rotativo", { threshold: 10, maxRagChunks: 2 });
    expect(rag.mode).toBe("rag");
    expect(rag.retrievedChunks!.length).toBeLessThanOrEqual(2);
    expect(rag.retrievedChunks![0].chunk.content).toContain("inventario rotativo");
    expect(rag.retrievedChunks!.every((r) => r.document.mentorId === w.id("men1"))).toBe(true);
    expect(rag.citations[0].chunkIndex).toBeTypeOf("number");
  });

  it("buildMentorContext arma el bloque con perfil, metodología y documentos citados", async () => {
    const w = await world();
    const men = w.as("men1");
    expect(await buildMentorContext(w.repo, w.id("men1"), "hola")).toEqual({ text: "", citations: [] });

    await saveMentorProfile(men, {
      headline: "Mentora de comercios de barrio",
      methodology: "Primero los números del mes.",
      focusAreas: ["finanzas", "ventas"],
      assistantTone: "Cercano, de tú.",
    });
    const doc = await addMentorDocument(men, { title: "Método de los tres números", filename: "metodo.md", content: METHOD, fileType: "markdown", kind: "methodology" });

    const ctx = await buildMentorContext(w.repo, w.id("men1"), "¿cómo reviso la caja?");
    expect(ctx.text.startsWith("<mentor_context>")).toBe(true);
    expect(ctx.text.endsWith("</mentor_context>")).toBe(true);
    for (const part of ["Mentora Asignada", "Mentora de comercios de barrio", "Primero los números del mes.", "finanzas, ventas", "Cercano, de tú.", "Método de los tres números", "revísalos cada semana"]) {
      expect(ctx.text).toContain(part);
    }
    expect(ctx.citations.map((c) => c.documentId)).toEqual([doc.id]);
  });

  it("copia una sola vez los recursos propios a documentos de referencia", async () => {
    const w = await world();
    const men = w.as("men1");
    await createResource(men, { title: "Canvas de margen", category: "template", description: "Plantilla para ver el margen.", content: "Producto | costo | precio", tags: ["finanzas"], isPublic: false });
    await createResource(w.as("men2"), { title: "De otro mentor", category: "guide", description: "No es mío.", content: "Contenido ajeno", tags: [], isPublic: true });

    const first = await importMentorResourcesToKnowledge(men);
    expect(first.imported).toBe(1);
    const docs = await listMentorDocuments(men);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ title: "Canvas de margen", kind: "reference", fileType: "markdown" });
    const stored = await w.repo.mentorDocuments.get(docs[0].id);
    expect(stored?.content).toContain("Producto | costo | precio");

    const again = await importMentorResourcesToKnowledge(men);
    expect(again).toEqual({ imported: 0, skipped: 1 });
    expect(await listMentorDocuments(men)).toHaveLength(1);
  });
});
