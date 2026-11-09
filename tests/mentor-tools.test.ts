import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND, closeWorlds, world, type World } from "./helpers";
import type { Project } from "@/types/domain";
import { createProjectAsMentor } from "@/lib/services/mentor-projects";
import { addProjectDocument } from "@/lib/services/project-knowledge";
import { saveMentorProfile } from "@/lib/services/mentor-profile";
import { addMentorDocument } from "@/lib/services/mentor-knowledge";
import { getOrCreateRoomThread } from "@/lib/services/session-room";
import { findB2BTool, toolsFor } from "@/lib/ai/tools/registry";
import { MENTOR_TOOLS, PUBLISH_PROPOSAL_KIND, simulatedSummary } from "@/lib/ai/tools/mentor";
import type { B2BToolContext } from "@/lib/ai/tools/types";

afterAll(closeWorlds);
beforeEach(() => {
  vi.stubEnv("RAX_B2B_FLOW", "on");
  // Sin IA: las herramientas usan su versión simulada (y lo declaran).
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("LOCAL_LLM_BASE_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

const AT = "2026-11-09T10:00:00.000Z";
const tool = (name: string) => MENTOR_TOOLS.find((t) => t.definition.name === name)!;

async function setup(mode: "individual" | "group" = "group") {
  const w: World = await world();
  const mentor = w.as("men1");
  const { project } = await createProjectAsMentor(mentor, { name: "Panadería La Espiga", description: "Pan de barrio", mode, clientEmails: [] });
  const clients = mode === "group" ? ["ent1", "ent2"] : ["ent1"];
  for (const c of clients) await w.repo.projectMembers.insert({ id: `${project.id}:${c}`, projectId: project.id, profileId: c, role: "client", createdAt: AT } as never);
  const session = await w.repo.mentorSessions.insert({ id: "ses_1", projectId: project.id, mentorId: "men1", kind: "follow_up", status: "in_progress", createdAt: AT, sessionNumber: 2, agenda: [] });
  const fresh = (await w.repo.projects.get(project.id)) as Project;
  const ctx = (threadId?: string): B2BToolContext => ({ deps: mentor, project: fresh, threadId });
  return { w, project: fresh, session, mentor, ctx };
}

describe("herramientas del mentor: registro (Fase 4, Dev A)", () => {
  it("solo el mentor y solo con la bandera", () => {
    const scope = { field: false, thread: true, session: false, siblings: false };
    const names = MENTOR_TOOLS.map((t) => t.definition.name);
    expect(names).toEqual(["search_mentor_knowledge", "summarize_document", "draft_material", "propose_publish"]);
    expect(toolsFor("mentor", { ...scope, b2b: true }).map((t) => t.name)).toEqual(expect.arrayContaining(names));
    expect(toolsFor("mentor", scope).map((t) => t.name)).not.toContain("draft_material");
    expect(toolsFor("entrepreneur", { ...scope, b2b: true }).map((t) => t.name)).not.toContain("propose_publish");
    expect(findB2BTool("mentor", "propose_publish")).toBeDefined();
    expect(findB2BTool("entrepreneur", "draft_material")).toBeUndefined();
  });

  it("resumen simulado: secciones y primeras ideas, declarado", () => {
    const text = simulatedSummary("Guía", "## Precios\n\nEl margen se calcula restando costos al precio de venta.\n\n## Caja\n\nAnotar todo lo que entra y sale cada día.");
    expect(text).toContain("sin IA");
    expect(text).toContain("Secciones: Precios · Caja");
    expect(text).toContain("• El margen se calcula");
  });
});

describe.skipIf(BACKEND === "pg")("herramientas del mentor: ejecución (Fase 4, Dev A)", () => {
  it("search_mentor_knowledge usa el perfil y la biblioteca del propio mentor", async () => {
    const { mentor, ctx } = await setup();
    const empty = await tool("search_mentor_knowledge").run(ctx(), { query: "margen" });
    expect(empty.data).toMatchObject({ ok: true, found: false });

    await saveMentorProfile(mentor, { methodology: "Trabajo con ciclos cortos de dos semanas y métricas simples." });
    await addMentorDocument(mentor, { title: "Plantilla de costos", filename: "costos.md", content: "Costos fijos y variables del negocio.", fileType: "markdown", kind: "template" });
    const res = await tool("search_mentor_knowledge").run(ctx(), { query: "costos" });
    expect(res.data).toMatchObject({ ok: true, found: true });
    expect(res.summary).toContain("ciclos cortos de dos semanas");
    expect(res.summary).toContain("Plantilla de costos");
    expect((await tool("search_mentor_knowledge").run(ctx(), {})).data).toMatchObject({ ok: false });
  });

  it("summarize_document: documento del proyecto o de la biblioteca del mentor", async () => {
    const { project, mentor, ctx } = await setup();
    await addProjectDocument(mentor, project.id, { title: "Guía de precios", filename: "guia.md", content: "## Precios\n\nEl margen se calcula restando costos al precio de venta.", fileType: "markdown", source: "upload" });
    const res = await tool("summarize_document").run(ctx(), { title: "precios" });
    expect(res.data).toMatchObject({ ok: true, source: "project", title: "Guía de precios" });
    expect(res.summary).toContain("Resumen de «Guía de precios»");

    const mine = await addMentorDocument(mentor, { title: "Método de caja", filename: "caja.md", content: "## Caja diaria\n\nAnotar todo lo que entra y sale cada día del negocio.", fileType: "markdown", kind: "methodology" });
    const fromLibrary = await tool("summarize_document").run(ctx(), { source: "mentor", document_id: mine.id });
    expect(fromLibrary.data).toMatchObject({ ok: true, source: "mentor", documentId: mine.id });

    const missing = await tool("summarize_document").run(ctx(), { title: "inexistente" });
    expect(missing.data).toMatchObject({ ok: false });
  });

  it("draft_material en la sala: queda en el proyecto solo para el mentor y ligado a la sesión", async () => {
    const { w, project, session, mentor, ctx } = await setup();
    const thread = await getOrCreateRoomThread(mentor, session.id);
    const res = await tool("draft_material").run(ctx(thread.id), { title: "Guía de caja", topic: "Cómo llevar la caja diaria", format: "docx" });
    expect(res.data).toMatchObject({ ok: true, visibility: "mentor_only" });
    const documentId = (res.data as { documentId: string }).documentId;
    expect(res.artifacts?.[0]).toMatchObject({ title: "Guía de caja", format: "docx", documentId });
    expect(await w.repo.projectDocuments.get(documentId)).toMatchObject({
      projectId: project.id,
      visibility: "mentor_only",
      docKind: "material",
      mentorSessionId: session.id,
      createdBy: "men1",
    });

    // Fuera de la sala (sin hilo de sala) no se liga a ninguna sesión.
    const plain = await tool("draft_material").run(ctx(), { title: "Otra guía", topic: "Inventario" });
    const otherId = (plain.data as { documentId: string }).documentId;
    expect((await w.repo.projectDocuments.get(otherId))?.mentorSessionId).toBeUndefined();

    expect((await tool("draft_material").run(ctx(), { title: "Basada", topic: "x", based_on: "no existe" })).data).toMatchObject({ ok: false });
  });

  it("propose_publish devuelve una tarjeta para confirmar y no publica", async () => {
    const { w, project, mentor, ctx } = await setup("group");
    const doc = await addProjectDocument(mentor, project.id, { title: "Guía de precios", filename: "guia.md", content: "Contenido", fileType: "markdown", source: "upload" });
    const res = await tool("propose_publish").run(ctx(), { title: "Guía de precios", audience_client_id: "ent2", reason: "La pidió en la sesión" });
    expect(res.data).toMatchObject({ ok: true, documentId: doc.id, alreadyPublished: false });
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0]).toMatchObject({
      type: "recommendation",
      title: "Publicar «Guía de precios» para Emprendedor Dos",
      needsHumanApproval: true,
      metadata: { kind: PUBLISH_PROPOSAL_KIND, documentId: doc.id, audienceClientId: "ent2", projectId: project.id },
    });
    expect((await w.repo.projectDocuments.get(doc.id))?.visibility ?? "mentor_only").toBe("mentor_only");
    expect(await w.repo.notifications.list({ profileId: "ent2" })).toHaveLength(0);

    expect((await tool("propose_publish").run(ctx(), { document_id: doc.id, audience_client_id: "men2" })).data).toMatchObject({ ok: false });
    expect((await tool("propose_publish").run(ctx(), { title: "nada" })).data).toMatchObject({ ok: false });
  });

  it("el hilo de la sala: uno por mentor y sesión, en el servidor; el cliente no lo abre", async () => {
    const { w, session, mentor } = await setup();
    const a = await getOrCreateRoomThread(mentor, session.id);
    const b = await getOrCreateRoomThread(mentor, session.id);
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ scope: "session_room", mentorSessionId: session.id, creatorId: "men1", title: "Sala · Sesión 2 · Panadería La Espiga" });
    expect((await getOrCreateRoomThread(w.as("ent1"), session.id).catch((e: { code?: string }) => e)) as { code?: string }).toMatchObject({ code: "forbidden" });
    expect((await getOrCreateRoomThread(w.as("men2"), session.id).catch((e: { code?: string }) => e)) as { code?: string }).toMatchObject({ code: "not_found" });
  });
});
