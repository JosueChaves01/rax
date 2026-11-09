import { beforeEach, describe, expect, it } from "vitest";
import type { Profile, Project } from "@/types/domain";
import type { ServiceDeps } from "@/lib/services/base";
import type { Repository } from "@/lib/data/repository";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { isDomainError } from "@/lib/errors";
import { listNotifications, markNotificationRead, notify } from "@/lib/services/notifications";
import { listMyInvitations, respondInvitation, syncPendingInvitations } from "@/lib/services/invitations";
import { getClientHome } from "@/lib/services/client-portal";
import { getWorkspace, listMyProjects } from "@/lib/services/projects";
import { guard, relationOf } from "@/lib/services/base";
import { B2B_PEOPLE, sampleInvitation } from "./fixtures/b2b";

/**
 * Fase 2 · lado cliente: notificaciones del panel, invitaciones por correo (aceptar / rechazar desde la
 * campana), acceso del cliente al proyecto B2B e inicio del cliente.
 */

const AT = "2026-11-09T10:00:00.000Z";
const [MARA, CAMI, BETO] = B2B_PEOPLE;
const OUTSIDER: Profile = { id: "u_ximena", name: "Ximena Ajena", email: "x@demo.rax", role: "entrepreneur", mentorStatus: "none", onboardedAt: AT, createdAt: AT };
const OTHER_MENTOR: Profile = { id: "u_otro", name: "Otro Mentor", email: "otro@demo.rax", role: "mentor", mentorStatus: "approved", onboardedAt: AT, createdAt: AT };

let repo: Repository;
let tick = 0;
const as = (actor: Profile): ServiceDeps => ({
  repo,
  ai: new SimulatedProvider(),
  actor,
  now: () => new Date(Date.parse(AT) + ++tick * 1000).toISOString(),
  newId: (p) => `${p}_${++tick}`,
});
const code = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isDomainError(e) ? e.code : String(e)));

async function seed(mode: Project["mode"] = "individual") {
  repo = createMemoryRepository();
  for (const p of [...B2B_PEOPLE, OUTSIDER, OTHER_MENTOR]) await repo.profiles.insert(p);
  // Proyecto B2B recién creado por el mentor: sin owner_id (lo deja vacío createProjectAsMentor).
  await repo.projects.insert({
    id: "prj_panaderia",
    mentorId: MARA.id,
    mode,
    cycleStage: "intake",
    name: "Panadería La Espiga",
    description: "Pan de barrio",
    nature: "operating_business",
    status: "active",
    shareConversationWithMentor: false,
    createdAt: AT,
    updatedAt: AT,
  } as unknown as Project);
  await repo.projectInvitations.insert(sampleInvitation("prj_panaderia", CAMI.email));
}

beforeEach(async () => {
  tick = 0;
  await seed();
});

describe("notificaciones del panel", () => {
  it("cualquier servicio notifica a cualquier perfil; cada persona lee y marca solo las suyas", async () => {
    const n = await notify(as(MARA), CAMI.id, "session_scheduled", { projectId: "prj_panaderia", sessionId: "s1" });
    await notify(as(MARA), BETO.id, "session_scheduled", { projectId: "prj_panaderia", sessionId: "s1" });
    expect(await listNotifications(as(CAMI))).toHaveLength(1);
    expect(await code(markNotificationRead(as(BETO), n.id))).toBe("not_found");
    await markNotificationRead(as(CAMI), n.id);
    const readAt = (await repo.notifications.get(n.id))?.readAt;
    expect(readAt).toBeDefined();
    await markNotificationRead(as(CAMI), n.id);
    expect((await repo.notifications.get(n.id))?.readAt).toBe(readAt);
    expect(await listNotifications(as(CAMI), { unreadOnly: true })).toHaveLength(0);
    expect(await code(notify(as(MARA), CAMI.id, "otra_cosa" as never, {}))).toBe("validation");
  });
});

describe("invitaciones desde el panel", () => {
  it("lista por correo (sin importar mayúsculas) con nombre del proyecto y del mentor", async () => {
    const mine = await listMyInvitations(as({ ...CAMI, email: "  CAMI@demo.rax " }));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ projectName: "Panadería La Espiga", mentorName: MARA.name, status: "pending" });
    expect(await listMyInvitations(as(BETO))).toEqual([]);
  });

  it("syncPendingInvitations crea la notificación que falta y es idempotente", async () => {
    expect(await syncPendingInvitations(as(CAMI))).toBe(1);
    expect(await syncPendingInvitations(as(CAMI))).toBe(0);
    const [n] = await listNotifications(as(CAMI));
    expect(n).toMatchObject({ kind: "project_invitation", payload: { invitationId: "inv_cami", projectId: "prj_panaderia", projectName: "Panadería La Espiga" } });
    // Si inviteClient (Dev A) ya notificó, no se duplica.
    await repo.projectInvitations.insert({ ...sampleInvitation("prj_panaderia", BETO.email), id: "inv_beto" });
    await notify(as(MARA), BETO.id, "project_invitation", { invitationId: "inv_beto", projectId: "prj_panaderia" });
    expect(await syncPendingInvitations(as(BETO))).toBe(0);
  });

  it("aceptar: alta como cliente (sin owner_id), notificación leída y acceso al proyecto", async () => {
    await syncPendingInvitations(as(CAMI));
    expect(await code(getWorkspace(as(CAMI), "prj_panaderia"))).toBe("not_found");

    const res = await respondInvitation(as(CAMI), "inv_cami", true);
    expect(res).toEqual({ projectId: "prj_panaderia", status: "accepted" });
    expect(await repo.projectMembers.list({ projectId: "prj_panaderia" })).toEqual([
      expect.objectContaining({ profileId: CAMI.id, role: "client" }),
    ]);
    const inv = await repo.projectInvitations.get("inv_cami");
    expect(inv).toMatchObject({ status: "accepted", respondedBy: CAMI.id });
    expect(inv?.respondedAt).toBeDefined();
    expect((await repo.projects.get("prj_panaderia"))?.ownerId).toBeUndefined();
    expect(await listNotifications(as(CAMI), { unreadOnly: true })).toEqual([]);
    expect(await listMyInvitations(as(CAMI))).toEqual([]);

    // Repetir la aceptación no duplica; cambiar de opinión ya no se puede.
    expect(await respondInvitation(as(CAMI), "inv_cami", true)).toEqual(res);
    expect(await repo.projectMembers.count({ projectId: "prj_panaderia" })).toBe(1);
    expect(await code(respondInvitation(as(CAMI), "inv_cami", false))).toBe("validation");

    // Ahora el proyecto aparece y abre (layout de /app/p/[id] no da 404).
    expect((await listMyProjects(as(CAMI))).map((p) => p.id)).toEqual(["prj_panaderia"]);
    const w = await getWorkspace(as(CAMI), "prj_panaderia");
    expect(w.relation).toMatchObject({ isClient: true, isOwner: false });
    expect(w.isMentorView).toBe(false);
    expect(w.permissions["project.update"]).toBe(false);
    expect(w.permissions["diagnosis.edit"]).toBe(false);
    expect(w.mentors).toEqual([MARA.id]);
    expect(w.people[MARA.id]?.name).toBe(MARA.name);
    // El cliente no hereda el permiso viejo de lectura: los demás servicios siguen cerrados.
    expect(await code(guard(as(CAMI), "prj_panaderia", "project.read"))).toBe("forbidden");
    // No se creó un diagnóstico por abrir el proyecto como cliente.
    expect(await repo.diagnoses.count({ projectId: "prj_panaderia" })).toBe(0);
  });

  it("rechazar deja la invitación declinada y sin alta", async () => {
    await syncPendingInvitations(as(CAMI));
    expect(await respondInvitation(as(CAMI), "inv_cami", false)).toEqual({ projectId: "prj_panaderia", status: "declined" });
    expect(await repo.projectMembers.count({ projectId: "prj_panaderia" })).toBe(0);
    expect(await listNotifications(as(CAMI), { unreadOnly: true })).toEqual([]);
    expect(await code(getWorkspace(as(CAMI), "prj_panaderia"))).toBe("not_found");
  });

  it("solo la persona del correo responde; revocadas y cuentas de mentor no entran", async () => {
    expect(await code(respondInvitation(as(BETO), "inv_cami", true))).toBe("not_found");
    expect(await code(respondInvitation(as(OUTSIDER), "nada", true))).toBe("not_found");
    await repo.projectInvitations.insert({ ...sampleInvitation("prj_panaderia", OTHER_MENTOR.email), id: "inv_mentor" });
    expect(await code(respondInvitation(as(OTHER_MENTOR), "inv_mentor", true))).toBe("validation");
    await repo.projectInvitations.update("inv_cami", { status: "revoked" });
    expect(await code(respondInvitation(as(CAMI), "inv_cami", true))).toBe("validation");
    expect(await listMyInvitations(as(CAMI))).toEqual([]);
    expect(await syncPendingInvitations(as(CAMI))).toBe(0);
  });
});

describe("acceso B2B al proyecto", () => {
  it("el mentor dueño (sin asignación) abre el proyecto como mentor; un mentor ajeno no", async () => {
    const rel = await relationOf(as(MARA), "prj_panaderia");
    expect(rel).toMatchObject({ isProjectMentor: true, isAssignedMentor: false });
    const w = await getWorkspace(as(MARA), "prj_panaderia");
    expect(w.isMentorView).toBe(true);
    expect(w.permissions["mentor.note"]).toBe(true);
    expect(await code(getWorkspace(as(OTHER_MENTOR), "prj_panaderia"))).toBe("not_found");
  });

  it("proyecto grupal: cada cliente abre el proyecto y no ve la conversación (entrevistas) de nadie", async () => {
    await seed("group");
    await repo.projectInvitations.insert({ ...sampleInvitation("prj_panaderia", BETO.email), id: "inv_beto" });
    await respondInvitation(as(CAMI), "inv_cami", true);
    await respondInvitation(as(BETO), "inv_beto", true);
    await repo.messages.insert({ id: "m1", conversationId: "c1", projectId: "prj_panaderia", author: "entrepreneur", authorId: CAMI.id, content: "secreto", intakeClientId: CAMI.id, createdAt: AT });
    for (const who of [CAMI, BETO]) {
      const w = await getWorkspace(as(who), "prj_panaderia");
      expect(w.relation.isClient).toBe(true);
      expect(w.messages).toEqual([]);
      expect(w.audit).toEqual([]);
    }
  });
});

describe("inicio del cliente", () => {
  it("muestra invitaciones, proyectos con etapa, entrevista pendiente, próxima sesión y material nuevo", async () => {
    let home = await getClientHome(as(CAMI));
    expect(home.projects).toEqual([]);
    expect(home.invitations.map((i) => i.projectName)).toEqual(["Panadería La Espiga"]);

    await syncPendingInvitations(as(CAMI));
    expect((await getClientHome(as(CAMI))).unreadNotifications).toBe(1);
    await respondInvitation(as(CAMI), "inv_cami", true);
    await repo.mentorSessions.insert({ id: "ses_k", projectId: "prj_panaderia", mentorId: MARA.id, kind: "kickoff", status: "pending", sessionNumber: 1, agenda: [], createdAt: AT });
    const recent = new Date(Date.parse(AT) + 60_000).toISOString();
    const base = { projectId: "prj_panaderia", filename: "x.md", content: "x", fileType: "markdown", tokenCount: 1, source: "upload", createdBy: MARA.id, createdAt: AT, updatedAt: AT } as const;
    await repo.projectDocuments.insert({ ...base, id: "doc_pub", title: "Guía de margen", visibility: "published", publishedAt: recent } as never);
    await repo.projectDocuments.insert({ ...base, id: "doc_draft", title: "Borrador", visibility: "mentor_only" } as never);
    await repo.projectDocuments.insert({ ...base, id: "doc_beto", title: "Solo Beto", visibility: "published", publishedAt: recent, audienceClientId: BETO.id } as never);

    home = await getClientHome(as(CAMI));
    expect(home.invitations).toEqual([]);
    expect(home.unreadNotifications).toBe(0);
    expect(home.projects).toHaveLength(1);
    expect(home.projects[0]).toMatchObject({
      project: { id: "prj_panaderia", name: "Panadería La Espiga", mode: "individual", cycleStage: "intake" },
      mentorName: MARA.name,
      intakeStatus: "not_started",
      nextSession: { id: "ses_k", kind: "kickoff", status: "pending" },
      newResources: 1,
    });
    expect(home.projects[0].nextSession).not.toHaveProperty("scheduledAt");
    // Nadie más ve ese proyecto en su inicio.
    expect((await getClientHome(as(BETO))).projects).toEqual([]);
  });
});
