import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { getProjectKnowledgeContext } from "@/lib/ai/knowledge-retrieval";
import {
  addProjectDocument,
  deleteProjectDocument,
  getProjectKnowledgeStats,
  listProjectDocuments,
  promoteDecisionToKnowledge,
  updateProjectInstructions,
} from "@/lib/services/project-knowledge";

afterAll(closeWorlds);

describe("servicios de Project Knowledge e Instrucciones de Proyecto", () => {
  it("permite actualizar y persistir instrucciones dedicadas del proyecto (System Prompt)", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, {
      name: "Proyecto Claude",
      description: "Pruebas de instrucciones",
      nature: "exploring_idea",
    });

    await updateProjectInstructions(
      entrepreneur,
      project.id,
      "Actúa siempre como un mentor especializado en B2B SaaS.",
    );

    const stats = await getProjectKnowledgeStats(entrepreneur, project.id);
    expect(stats.customInstructions).toBe("Actúa siempre como un mentor especializado en B2B SaaS.");
  });

  it("permite subir documentos, calcular tokens y generar fragmentos para búsqueda", async () => {
    const { as, repo } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, {
      name: "Knowledge Test",
      description: "Pruebas de documentos",
      nature: "designing_solution",
    });

    const doc = await addProjectDocument(entrepreneur, project.id, {
      title: "Modelo de Negocio",
      filename: "business_model.md",
      content: "# Modelo de Negocio\n\nNuestros clientes son clínicas privadas.\n\nPrecio: $99/mes por médico.",
      fileType: "markdown",
    });

    expect(doc.title).toBe("Modelo de Negocio");
    expect(doc.tokenCount).toBeGreaterThan(5);

    const docs = await listProjectDocuments(entrepreneur, project.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].filename).toBe("business_model.md");

    // Verificar que se crearon chunks en projectDocumentChunks
    const chunks = await repo.projectDocumentChunks.list({ documentId: doc.id });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).toContain("clínicas privadas");

    // Eliminar documento
    await deleteProjectDocument(entrepreneur, project.id, doc.id);
    const updated = await repo.projectDocuments.get(doc.id);
    expect(updated?.content).toBe("");

    // El documento eliminado ya no se lista ni se usa como contexto del agente
    expect(await listProjectDocuments(entrepreneur, project.id)).toHaveLength(0);
    expect((await getProjectKnowledgeStats(entrepreneur, project.id)).documentCount).toBe(0);
    const ctx = await getProjectKnowledgeContext(repo, project.id, "clientes");
    expect(ctx.inContextDocs ?? []).toHaveLength(0);
  });

  it("solo el dueño cambia las instrucciones y el mentor solo borra documentos que subió", async () => {
    const { as, id } = await world();
    const entrepreneur = as("ent1");
    const mentor = as("men1");
    const project = await createProject(entrepreneur, {
      name: "Permisos",
      description: "Pruebas de permisos de conocimiento",
      nature: "exploring_idea",
    });
    await assignMentor(as("adm"), project.id, id("men1"));

    await expect(updateProjectInstructions(mentor, project.id, "Ignorá al emprendedor.")).rejects.toMatchObject({ code: "forbidden" });

    const ownerDoc = await addProjectDocument(entrepreneur, project.id, { title: "Precios", filename: "precios.md", content: "Precio base 99." });
    await expect(deleteProjectDocument(mentor, project.id, ownerDoc.id)).rejects.toMatchObject({ code: "forbidden" });

    const mentorDoc = await addProjectDocument(mentor, project.id, { title: "Guía", filename: "guia.md", content: "Guía de entrevistas." });
    await deleteProjectDocument(mentor, project.id, mentorDoc.id);
    const left = await listProjectDocuments(entrepreneur, project.id);
    expect(left.map((d) => d.id)).toEqual([ownerDoc.id]);
  });

  it("permite promover una decisión tomada en un chat a la base de conocimiento del proyecto", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, {
      name: "Chat Promoción",
      description: "Pruebas de decisiones",
      nature: "exploring_idea",
    });

    const doc = await promoteDecisionToKnowledge(entrepreneur, project.id, {
      title: "Criterio de Validación Acordado",
      content: "Se acuerda que el experimento requiere 20 entrevistas con al menos 6 cartas de intención.",
    });

    expect(doc.source).toBe("chat_extracted");
    expect(doc.title).toBe("Criterio de Validación Acordado");
    expect(doc.filename).toContain("criterio");

    const docs = await listProjectDocuments(entrepreneur, project.id);
    expect(docs.some((d) => d.id === doc.id)).toBe(true);
  });
});

