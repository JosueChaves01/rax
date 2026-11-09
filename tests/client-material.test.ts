import { describe, expect, it } from "vitest";
import {
  commentOnResource,
  getPublishedResource,
  listPublishedResources,
  listResourceComments,
  publishedDocumentSource,
  publishedKnowledgeContext,
} from "@/lib/services/client-portal";
import { listNotifications } from "@/lib/services/notifications";
import { documentSourceFromQuery } from "@/app/api/documentos/source";
import { isActive, materialHref, navFor } from "@/shared/ui/nav-items";
import { BETO, CAMI, MARA, OTHER_MENTOR, OUTSIDER, PID, b2bWorld, code } from "./fixtures/b2b-world";

/** Fase 4 · material publicado: lista, visor, comentarios (individual vs grupal) y menú del cliente. */

async function seedDocs(w: Awaited<ReturnType<typeof b2bWorld>>) {
  await w.repo.mentorSessions.insert({
    id: "ses_2", projectId: PID, mentorId: MARA.id, kind: "follow_up", status: "completed", sessionNumber: 2, agenda: [], createdAt: "2026-11-01T00:00:00.000Z",
  } as never);
  await w.doc("doc_guia", { title: "Guía de margen", visibility: "published", publishedAt: "2026-11-05T00:00:00.000Z", mentorSessionId: "ses_2", docKind: "summary" });
  await w.doc("doc_beto", { title: "Solo para Beto", visibility: "published", publishedAt: "2026-11-06T00:00:00.000Z", audienceClientId: BETO.id });
  await w.doc("doc_secreto", { title: "Notas privadas del mentor", content: "SECRETO: el cliente no debe leer esto" });
  await w.doc("doc_borrado", { visibility: "published", publishedAt: "2026-11-07T00:00:00.000Z", content: "" });
}

describe("material publicado", () => {
  it("el cliente ve lo publicado para todo el grupo o para él; el mentor ve todo lo publicado", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    await seedDocs(w);
    const cami = await listPublishedResources(w.as(CAMI), PID);
    expect(cami.map((r) => r.documentId)).toEqual(["doc_guia"]);
    expect(cami[0]).toMatchObject({ docKind: "summary", sessionId: "ses_2", commentCount: 0, projectId: PID });
    expect((await listPublishedResources(w.as(BETO), PID)).map((r) => r.documentId)).toEqual(["doc_beto", "doc_guia"]);
    const mara = await listPublishedResources(w.as(MARA), PID);
    expect(mara.map((r) => r.documentId)).toEqual(["doc_beto", "doc_guia"]);
    expect(mara[0].audienceClientId).toBe(BETO.id);
    expect(await code(listPublishedResources(w.as(OUTSIDER), PID))).toBe("not_found");
    expect(await code(listPublishedResources(w.as(OTHER_MENTOR), PID))).toBe("not_found");
  });

  it("el visor (/api/documentos) solo le da al cliente documentos publicados para él", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    await seedDocs(w);
    const q = (doc: string) => new URLSearchParams({ proyecto: PID, documento: doc });
    expect((await documentSourceFromQuery(w.as(CAMI), q("doc_guia")))?.content).toBe("Contenido de doc_guia");
    expect(await code(documentSourceFromQuery(w.as(CAMI), q("doc_secreto")))).toBe("not_found");
    expect(await code(documentSourceFromQuery(w.as(CAMI), q("doc_beto")))).toBe("not_found");
    expect(await code(documentSourceFromQuery(w.as(OUTSIDER), q("doc_guia")))).toBe("not_found");
    // El mentor sigue leyendo cualquier documento de su proyecto.
    expect((await documentSourceFromQuery(w.as(MARA), q("doc_secreto")))?.content).toContain("SECRETO");
    expect((await publishedDocumentSource(w.as(BETO), PID, "doc_beto")).title).toBe("Solo para Beto");
    expect(await code(getPublishedResource(w.as(CAMI), PID, "doc_borrado"))).toBe("not_found");
  });

  it("el conocimiento del asistente del cliente solo incluye lo publicado para él", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    await seedDocs(w);
    const k = await publishedKnowledgeContext(w.as(CAMI), PID, "margen");
    expect(k.inContextDocs?.map((d) => d.id)).toEqual(["doc_guia"]);
    expect(JSON.stringify(k)).not.toContain("SECRETO");
  });
});

describe("comentarios del material y las sesiones", () => {
  it("individual: los ven la persona y el mentor; el mentor recibe el aviso", async () => {
    const w = await b2bWorld("individual", [CAMI]);
    await seedDocs(w);
    await commentOnResource(w.as(CAMI), { type: "document", id: "doc_guia" }, "  ¿El margen incluye el gas?  ");
    await commentOnResource(w.as(MARA), { type: "document", id: "doc_guia" }, "Sí, inclúyelo.");
    const thread = await listResourceComments(w.as(CAMI), { type: "document", id: "doc_guia" });
    expect(thread.map((c) => [c.authorName, c.authorRole, c.body])).toEqual([
      ["Tú", "client", "¿El margen incluye el gas?"],
      [MARA.name, "mentor", "Sí, inclúyelo."],
    ]);
    expect((await listPublishedResources(w.as(CAMI), PID))[0].commentCount).toBe(2);
    expect((await listNotifications(w.as(MARA))).find((n) => n.kind === "comment_added")?.payload).toMatchObject({ projectId: PID, targetType: "document", targetId: "doc_guia" });
    expect((await listNotifications(w.as(CAMI))).filter((n) => n.kind === "comment_added")).toHaveLength(1);

    expect(await code(commentOnResource(w.as(CAMI), { type: "document", id: "doc_secreto" }, "hola"))).toBe("not_found");
    expect(await code(commentOnResource(w.as(OUTSIDER), { type: "document", id: "doc_guia" }, "hola"))).toBe("not_found");
    expect(await code(commentOnResource(w.as(CAMI), { type: "document", id: "doc_guia" }, "   "))).toBe("validation");
    expect(await code(commentOnResource(w.as(CAMI), { type: "document", id: "doc_guia" }, "x".repeat(2001)))).toBe("validation");
    expect(await code(commentOnResource(w.as(CAMI), { type: "hypothesis" as never, id: "h1" }, "hola"))).toBe("validation");
  });

  it("individual: un comentario de otra persona (p. ej. de antes de un cambio de modo) no se muestra", async () => {
    const w = await b2bWorld("individual", [CAMI]);
    await seedDocs(w);
    await w.repo.comments.insert({ id: "cmt_viejo", projectId: PID, targetType: "document", targetId: "doc_guia", authorId: BETO.id, body: "De otra persona", createdAt: "2026-11-08T00:00:00.000Z" });
    expect(await listResourceComments(w.as(CAMI), { type: "document", id: "doc_guia" })).toEqual([]);
    expect(await listResourceComments(w.as(MARA), { type: "document", id: "doc_guia" })).toHaveLength(1);
  });

  it("grupal: los comentarios son visibles para el grupo; los de sesión también", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    await seedDocs(w);
    await commentOnResource(w.as(CAMI), { type: "document", id: "doc_guia" }, "Duda de Cami");
    const forBeto = await listResourceComments(w.as(BETO), { type: "document", id: "doc_guia" });
    expect(forBeto.map((c) => c.authorName)).toEqual([CAMI.name]);
    // Avisos: al mentor y al resto del grupo.
    expect((await listNotifications(w.as(BETO))).map((n) => n.kind)).toContain("comment_added");
    expect((await listNotifications(w.as(MARA))).map((n) => n.kind)).toContain("comment_added");

    await commentOnResource(w.as(BETO), { type: "session", id: "ses_2" }, "Gracias por la sesión");
    expect((await listResourceComments(w.as(CAMI), { type: "session", id: "ses_2" })).map((c) => c.body)).toEqual(["Gracias por la sesión"]);
    // El material solo para Beto: Cami no lo comenta ni lo lee.
    expect(await code(listResourceComments(w.as(CAMI), { type: "document", id: "doc_beto" }))).toBe("not_found");
    await commentOnResource(w.as(MARA), { type: "document", id: "doc_beto" }, "Para ti, Beto");
    expect((await listNotifications(w.as(CAMI))).filter((n) => n.kind === "comment_added" && n.payload.targetId === "doc_beto")).toHaveLength(0);
  });
});

describe("menú del cliente: Material", () => {
  it("abre el material del proyecto actual o del único proyecto; si no, Documentos", () => {
    expect(materialHref({})).toBe("/app/documentos");
    expect(materialHref({ clientProjectIds: ["p1"] })).toBe("/app/p/p1/material");
    expect(materialHref({ clientProjectIds: ["p1", "p2"] })).toBe("/app/documentos");
    expect(materialHref({ clientProjectIds: ["p1", "p2"], currentProjectId: "p2" })).toBe("/app/p/p2/material");
    expect(materialHref({ clientProjectIds: ["p1"], currentProjectId: "ajeno" })).toBe("/app/p/p1/material");
    const [home, , material] = navFor("entrepreneur", "/app/chat", { b2b: true, clientProjectIds: ["p1"] }).main;
    expect(material.href).toBe("/app/p/p1/material");
    expect(isActive(material, "/app/p/p1/material")).toBe(true);
    expect(isActive(home, "/app/p/p1/material")).toBe(false);
    expect(isActive(home, "/app/p/p1/sesiones")).toBe(true);
  });
});
