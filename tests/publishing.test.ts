import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND, closeWorlds, world, type World } from "./helpers";
import type { MentorSession, PostSessionSynthesis } from "@/types/domain";
import { createProjectAsMentor } from "@/lib/services/mentor-projects";
import { addProjectDocument } from "@/lib/services/project-knowledge";
import {
  getProjectPublishing,
  getSessionPublishables,
  publishDocument,
  publishSessionSynthesis,
  unpublishDocument,
} from "@/lib/services/publishing";

afterAll(closeWorlds);
beforeEach(() => vi.stubEnv("RAX_B2B_FLOW", "on"));
afterEach(() => vi.unstubAllEnvs());

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string }) => e);
const AT = "2026-11-09T10:00:00.000Z";

const SYNTHESIS: PostSessionSynthesis = {
  generatedAt: AT,
  summary: "Revisamos el margen por producto: el pan dulce deja más que el salado.",
  agreedDecisions: ["Subir el precio del pan salado"],
  entrepreneurCommitments: [{ title: "Anotar ventas diarias", dueDate: "2026-11-16" }],
  mentorCommitments: [{ title: "Enviar plantilla de costos" }],
  nextSteps: "Revisar la caja de la semana.",
};

/** Proyecto B2B del mentor men1 con clientes que aceptaron, una sesión y un documento del mentor. */
async function setup(mode: "individual" | "group" = "group") {
  const w: World = await world();
  const mentor = w.as("men1");
  const { project } = await createProjectAsMentor(mentor, { name: "Panadería La Espiga", description: "Pan de barrio", mode, clientEmails: [] });
  const clients = mode === "group" ? ["ent1", "ent2"] : ["ent1"];
  for (const c of clients) await w.repo.projectMembers.insert({ id: `${project.id}:${c}`, projectId: project.id, profileId: c, role: "client", createdAt: AT } as never);
  const session: MentorSession = await w.repo.mentorSessions.insert({
    id: "ses_1", projectId: project.id, mentorId: "men1", kind: "follow_up", status: "completed", createdAt: AT, completedAt: AT, sessionNumber: 2, agenda: [],
  });
  const doc = await addProjectDocument(mentor, project.id, { title: "Guía de precios", filename: "guia.md", content: "## Precios\n\nCómo calcular el margen.", fileType: "markdown", source: "upload" });
  return { w, project, session, doc, mentor };
}

const notificationsOf = (w: World, who: string) => w.repo.notifications.list({ profileId: who });

describe.skipIf(BACKEND === "pg")("publicación de material al cliente (Fase 4, Dev A)", () => {
  it("grupal: publica para todo el grupo, avisa una sola vez y se despublica", async () => {
    const { w, project, doc, mentor } = await setup("group");
    expect((await w.repo.projectDocuments.get(doc.id))?.visibility ?? "mentor_only").toBe("mentor_only");

    const res = await publishDocument(mentor, doc.id);
    expect(res).toMatchObject({ documentId: doc.id, projectId: project.id, title: "Guía de precios", docKind: "material", commentCount: 0 });
    expect(res.audienceClientId).toBeUndefined();
    expect(await w.repo.projectDocuments.get(doc.id)).toMatchObject({ visibility: "published", publishedAt: res.publishedAt });
    for (const c of ["ent1", "ent2"]) {
      expect((await notificationsOf(w, c)).map((n) => [n.kind, n.payload.documentId])).toEqual([["resource_published", doc.id]]);
    }

    // Republicar para el mismo público no vuelve a avisar ni cambia la fecha.
    const again = await publishDocument(mentor, doc.id);
    expect(again.publishedAt).toBe(res.publishedAt);
    expect(await notificationsOf(w, "ent1")).toHaveLength(1);

    await w.repo.comments.insert({ id: "c1", projectId: project.id, targetType: "document", targetId: doc.id, authorId: "ent1", body: "¿Y el IVA?", createdAt: AT });
    expect((await publishDocument(mentor, doc.id)).commentCount).toBe(1);

    await unpublishDocument(mentor, doc.id);
    expect((await w.repo.projectDocuments.get(doc.id))?.visibility).toBe("mentor_only");
    await unpublishDocument(mentor, doc.id); // repetirlo no falla
  });

  it("grupal: para una persona en particular; solo a clientes del proyecto", async () => {
    const { w, doc, mentor } = await setup("group");
    const res = await publishDocument(mentor, doc.id, { audienceClientId: "ent2" });
    expect(res.audienceClientId).toBe("ent2");
    expect(await notificationsOf(w, "ent2")).toHaveLength(1);
    expect(await notificationsOf(w, "ent1")).toHaveLength(0);

    // Ampliarlo al grupo avisa solo a quien todavía no lo veía.
    await publishDocument(mentor, doc.id);
    expect(await notificationsOf(w, "ent1")).toHaveLength(1);
    expect(await notificationsOf(w, "ent2")).toHaveLength(1);

    expect((await errorOf(publishDocument(mentor, doc.id, { audienceClientId: "men2" })))?.code).toBe("validation");
    expect((await errorOf(publishDocument(mentor, doc.id, { docKind: "intake" })))?.code).toBe("validation");
  });

  it("individual: todo lo publicado es para la única persona", async () => {
    const { w, doc, mentor } = await setup("individual");
    const res = await publishDocument(mentor, doc.id, { audienceClientId: "ent1", docKind: "material" });
    expect(res.audienceClientId).toBeUndefined();
    expect((await w.repo.projectDocuments.get(doc.id))?.audienceClientId).toBeUndefined();
    expect(await notificationsOf(w, "ent1")).toHaveLength(1);
  });

  it("solo el mentor del proyecto publica", async () => {
    const { w, doc, session } = await setup("group");
    expect((await errorOf(publishDocument(w.as("ent1"), doc.id)))?.code).toBe("forbidden");
    expect((await errorOf(publishDocument(w.as("men2"), doc.id)))?.code).toBe("not_found");
    expect((await errorOf(unpublishDocument(w.as("ent1"), doc.id)))?.code).toBe("forbidden");
    expect((await errorOf(publishDocument(w.as("men1"), "pdoc_no")))?.code).toBe("not_found");
    expect((await errorOf(publishSessionSynthesis(w.as("ent1"), session.id)))?.code).toBe("forbidden");
    expect(await getProjectPublishing(w.as("ent1"), doc.projectId)).toBeNull();
    expect(await getProjectPublishing(w.as("men2"), doc.projectId)).toBeNull();
  });

  it("la síntesis aprobada se publica con un clic como `summary` y se actualiza en el mismo documento", async () => {
    const { w, project, session, mentor } = await setup("group");
    expect((await errorOf(publishSessionSynthesis(mentor, session.id)))?.code).toBe("validation");

    await w.repo.mentorSessions.update(session.id, { postSessionSynthesis: SYNTHESIS });
    const res = await publishSessionSynthesis(mentor, session.id);
    expect(res).toMatchObject({ docKind: "summary", sessionId: session.id });
    const doc = await w.repo.projectDocuments.get(res.documentId);
    expect(doc).toMatchObject({ docKind: "summary", mentorSessionId: session.id, visibility: "published", projectId: project.id });
    expect(doc?.title).toContain("Sesión 2");
    expect(doc?.content).toContain("el pan dulce deja más");
    expect(doc?.content).toContain("## Tus compromisos");
    expect(await notificationsOf(w, "ent1")).toHaveLength(1);

    // El mentor corrige la síntesis y la vuelve a publicar: mismo documento, contenido nuevo, sin nuevo aviso.
    await w.repo.mentorSessions.update(session.id, { postSessionSynthesis: { ...SYNTHESIS, summary: "Versión corregida de la síntesis." } });
    const again = await publishSessionSynthesis(mentor, session.id);
    expect(again.documentId).toBe(res.documentId);
    expect((await w.repo.projectDocuments.get(res.documentId))?.content).toContain("Versión corregida");
    const chunks = await w.repo.projectDocumentChunks.list({ documentId: res.documentId });
    expect(chunks.some((c) => c.content.includes("Versión corregida"))).toBe(true);
    expect(await notificationsOf(w, "ent1")).toHaveLength(1);

    // Para una sola persona del grupo.
    expect((await publishSessionSynthesis(mentor, session.id, { audienceClientId: "ent2" })).audienceClientId).toBe("ent2");
  });

  it("lo publicable de una sesión: síntesis, transcripción y material de la sesión", async () => {
    const { w, project, session, doc, mentor } = await setup("group");
    const transcript = await addProjectDocument(mentor, project.id, { title: "Transcripción de llamada", filename: "llamada.md", content: "Mara: hola", fileType: "markdown", source: "note" });
    await w.repo.sessionCalls.insert({ id: "call_1", sessionId: session.id, projectId: project.id, startedBy: "men1", status: "ended", startedAt: AT, transcriptDocumentId: transcript.id, createdAt: AT });
    await w.repo.projectDocuments.update(doc.id, { mentorSessionId: session.id });
    await w.repo.mentorSessions.update(session.id, { postSessionSynthesis: SYNTHESIS });

    const before = await getSessionPublishables(mentor, session.id);
    expect(before.mode).toBe("group");
    expect(before.clients.map((c) => c.name)).toEqual(["Emprendedora Uno", "Emprendedor Dos"]);
    expect(before.synthesis).toMatchObject({ summary: SYNTHESIS.summary, document: undefined });
    expect(before.documents.map((x) => [x.title, x.docKind, x.visibility])).toEqual([
      ["Guía de precios", "material", "mentor_only"],
      ["Transcripción de llamada", "transcript", "mentor_only"],
    ]);

    await publishDocument(mentor, transcript.id, { sessionId: session.id, docKind: "transcript" });
    await publishSessionSynthesis(mentor, session.id);
    const after = await getSessionPublishables(mentor, session.id);
    expect(after.synthesis?.document?.visibility).toBe("published");
    expect(after.documents.find((x) => x.id === transcript.id)).toMatchObject({ docKind: "transcript", visibility: "published" });
    expect(after.documents).toHaveLength(2);

    const projectView = await getProjectPublishing(mentor, project.id);
    expect(projectView?.documents[transcript.id]).toMatchObject({ visibility: "published", docKind: "transcript" });
    expect(projectView?.documents[doc.id]).toMatchObject({ visibility: "mentor_only" });
  });
});
