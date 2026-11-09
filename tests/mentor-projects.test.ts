import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world, type World } from "./helpers";
import { sampleIntakeBrief } from "./fixtures/b2b";
import type { IntakeBriefRecord, Notification } from "@/types/b2b";
import { notImplemented } from "@/lib/errors";
import {
  createProjectAsMentor,
  getIntakeBriefsForMentor,
  inviteClient,
  listMentorProjects,
  markIntakeReviewed,
  normalizeEmail,
  revokeInvitation,
  setClientContext,
} from "@/lib/services/mentor-projects";
import { getWorkspace, listMyProjects } from "@/lib/services/projects";
import { intakeInbox } from "@/features/mentoring/inbox";

/** `notify` es de Dev B: se reemplaza por el fake de contrato (notifySpy) y se puede hacer fallar. */
const h = vi.hoisted(() => ({ sent: [] as Notification[], fail: null as Error | null }));
vi.mock("@/lib/services/notifications", async () => {
  const { notifySpy } = await import("./fixtures/b2b");
  const spy = notifySpy();
  h.sent = spy.sent;
  return {
    notify: async (...args: Parameters<typeof spy.notify>) => {
      if (h.fail) throw h.fail;
      return spy.notify(...args);
    },
    listNotifications: async () => [],
    markNotificationRead: async () => undefined,
  };
});

afterAll(closeWorlds);
beforeEach(() => {
  h.sent.length = 0;
  h.fail = null;
});

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string }) => e);

async function newProject(w: World, input: Partial<Parameters<typeof createProjectAsMentor>[1]> = {}) {
  return createProjectAsMentor(w.as("men1"), { name: "Panadería La Espiga", description: "Pan de barrio", mode: "individual", clientEmails: [], ...input });
}

describe("proyectos del mentor (Fase 2, Dev A)", () => {
  it("el mentor crea un proyecto individual: sin dueño, en intake, con asignación activa y la invitación", async () => {
    const w = await world();
    const { project, invitations } = await newProject(w, { clientEmails: ["  Nueva.Clienta@Demo.rax "] });

    expect(project).toMatchObject({ name: "Panadería La Espiga", mentorId: w.id("men1"), mode: "individual", cycleStage: "intake", status: "active" });
    expect(project.ownerId ?? null).toBeNull();
    const assignments = await w.repo.mentorAssignments.list({ projectId: project.id, status: "active" });
    expect(assignments).toMatchObject([{ mentorId: w.id("men1"), assignedBy: w.id("men1") }]);
    expect(invitations).toMatchObject([{ email: "nueva.clienta@demo.rax", status: "pending", invitedBy: w.id("men1") }]);
    // Nadie con ese correo todavía: no se notifica.
    expect(h.sent).toHaveLength(0);

    // Las pantallas actuales siguen funcionando para el mentor (el diagnóstico se autorrepara).
    expect((await listMyProjects(w.as("men1"))).map((p) => p.id)).toContain(project.id);
    const ws = await getWorkspace(w.as("men1"), project.id);
    expect(ws.isMentorView).toBe(true);
    expect(ws.diagnosis).toBeTruthy();
    // Otra persona no lo ve.
    expect((await errorOf(getWorkspace(w.as("ent1"), project.id)))?.code).toBe("not_found");
  });

  it("valida antes de escribir: solo mentores, nombre, correos y modo", async () => {
    const w = await world();
    expect((await errorOf(createProjectAsMentor(w.as("ent1"), { name: "Algo", description: "", mode: "individual", clientEmails: [] })))?.code).toBe("forbidden");
    expect((await errorOf(newProject(w, { name: " x " })))?.code).toBe("validation");
    expect((await errorOf(newProject(w, { mode: "mixto" as never })))?.code).toBe("validation");
    expect((await errorOf(newProject(w, { clientEmails: ["a@demo.rax", "b@demo.rax"] })))?.code).toBe("validation");
    expect((await errorOf(newProject(w, { clientEmails: ["sin-arroba"] })))?.code).toBe("validation");
    // Un mentor no entra como cliente; tampoco el propio mentor.
    expect((await errorOf(newProject(w, { mode: "group", clientEmails: ["e1@test", "m2@test"] })))?.code).toBe("validation");
    expect((await errorOf(newProject(w, { clientEmails: ["M1@test"] })))?.code).toBe("validation");
    expect(await listMentorProjects(w.as("men1"))).toEqual([]);
  });

  it("grupal: invita a varias personas, deduplica y notifica a quien ya tiene cuenta", async () => {
    const w = await world();
    const { project, invitations } = await newProject(w, { mode: "group", clientEmails: ["E1@test", "e1@test", "", "nadie@demo.rax"] });
    expect(invitations.map((i) => i.email)).toEqual(["e1@test", "nadie@demo.rax"]);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ profileId: w.id("ent1"), kind: "project_invitation", payload: { projectId: project.id, projectName: "Panadería La Espiga" } });

    const more = await inviteClient(w.as("men1"), project.id, "e2@test");
    expect(more).toMatchObject({ notified: true, invitation: { email: "e2@test", status: "pending" } });
    expect((await errorOf(inviteClient(w.as("men1"), project.id, "E2@test")))?.code).toBe("validation");
  });

  it("si la notificación falla (o aún no existe), la invitación queda igual", async () => {
    const w = await world();
    const { project } = await newProject(w, { mode: "group" });
    h.fail = notImplemented("notify");
    const res = await inviteClient(w.as("men1"), project.id, "e1@test");
    expect(res).toMatchObject({ notified: false, invitation: { status: "pending" } });
    h.fail = new Error("caída");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await inviteClient(w.as("men1"), project.id, "e2@test")).notified).toBe(false);
    warn.mockRestore();
    expect(await w.repo.projectInvitations.count({ projectId: project.id })).toBe(2);
  });

  it("individual: una sola persona activa; revocar libera el lugar y se puede volver a invitar", async () => {
    const w = await world();
    const { project, invitations } = await newProject(w, { clientEmails: ["e1@test"] });
    expect((await errorOf(inviteClient(w.as("men1"), project.id, "e2@test")))?.code).toBe("validation");

    // Otro mentor no toca invitaciones ajenas; el proyecto ni existe para él.
    expect((await errorOf(revokeInvitation(w.as("men2"), invitations[0].id)))?.code).toBe("not_found");
    expect((await errorOf(inviteClient(w.as("men2"), project.id, "x@demo.rax")))?.code).toBe("not_found");

    await revokeInvitation(w.as("men1"), invitations[0].id);
    expect((await w.repo.projectInvitations.get(invitations[0].id))?.status).toBe("revoked");
    await revokeInvitation(w.as("men1"), invitations[0].id); // idempotente

    const again = await inviteClient(w.as("men1"), project.id, "e1@test");
    expect(again.invitation).toMatchObject({ id: invitations[0].id, status: "pending" });

    await w.repo.projectInvitations.update(again.invitation.id, { status: "accepted", respondedBy: w.id("ent1"), respondedAt: "2026-11-09T00:00:00.000Z" });
    expect((await errorOf(revokeInvitation(w.as("men1"), again.invitation.id)))?.code).toBe("validation");
  });

  it("normaliza correos", () => {
    expect(normalizeEmail("  Ana@Demo.RAX ")).toBe("ana@demo.rax");
    expect(() => normalizeEmail("ana demo")).toThrow();
  });
});

describe("brief del intake para el mentor (Fase 2, Dev A)", () => {
  async function groupWithIntakes(w: World) {
    const { project } = await newProject(w, { name: "Cooperativa", mode: "group", clientEmails: ["e1@test", "e2@test"] });
    const base = { projectId: project.id, guideSnapshot: [], coverage: {}, createdAt: "2026-11-08T00:00:00.000Z", updatedAt: "2026-11-08T00:00:00.000Z" };
    const rows: IntakeBriefRecord[] = [
      { ...base, id: crypto.randomUUID(), clientId: w.id("ent1"), status: "submitted", brief: sampleIntakeBrief(), submittedAt: "2026-11-08T10:00:00.000Z" },
      { ...base, id: crypto.randomUUID(), clientId: w.id("ent2"), status: "in_progress" },
      { ...base, id: crypto.randomUUID(), status: "submitted", brief: { ...sampleIntakeBrief(), summary: "Grupo" }, submittedAt: "2026-11-08T11:00:00.000Z" },
    ];
    for (const r of rows) await w.repo.intakeBriefs.insert(r);
    return { project, rows };
  }

  it("lee los briefs (consolidado primero) y solo el mentor del proyecto", async () => {
    const w = await world();
    const { project } = await groupWithIntakes(w);
    const view = await getIntakeBriefsForMentor(w.as("men1"), project.id);
    expect(view.project).toMatchObject({ id: project.id, mode: "group", cycleStage: "intake", clientContext: "" });
    expect(view.briefs.map((b) => b.clientName ?? "grupo")).toEqual(["grupo", "Emprendedor Dos", "Emprendedora Uno"]);
    expect(view.briefs[0].brief?.summary).toBe("Grupo");
    expect(view.invitations).toHaveLength(2);

    expect((await errorOf(getIntakeBriefsForMentor(w.as("men2"), project.id)))?.code).toBe("not_found");
    expect((await errorOf(getIntakeBriefsForMentor(w.as("ent1"), project.id)))?.code).toBe("not_found");
  });

  it("marca revisado por persona o todo lo enviado; lo no enviado no se marca", async () => {
    const w = await world();
    const { project, rows } = await groupWithIntakes(w);
    expect((await errorOf(markIntakeReviewed(w.as("men1"), project.id, w.id("ent2"))))?.code).toBe("validation");
    expect((await errorOf(markIntakeReviewed(w.as("men2"), project.id)))?.code).toBe("not_found");

    await markIntakeReviewed(w.as("men1"), project.id, w.id("ent1"));
    expect((await w.repo.intakeBriefs.get(rows[0].id))).toMatchObject({ status: "reviewed", reviewedAt: expect.any(String) });
    expect((await w.repo.intakeBriefs.get(rows[2].id))?.status).toBe("submitted");

    await markIntakeReviewed(w.as("men1"), project.id);
    expect((await w.repo.intakeBriefs.get(rows[2].id))?.status).toBe("reviewed");
    expect((await w.repo.intakeBriefs.get(rows[1].id))?.status).toBe("in_progress");
    await markIntakeReviewed(w.as("men1"), project.id); // ya revisado: no falla
  });

  it("sin intake enviado no hay nada que revisar", async () => {
    const w = await world();
    const { project } = await newProject(w);
    expect((await errorOf(markIntakeReviewed(w.as("men1"), project.id)))?.code).toBe("validation");
  });

  it("guarda el contexto faltante con límite y solo el mentor", async () => {
    const w = await world();
    const { project } = await newProject(w);
    await setClientContext(w.as("men1"), project.id, "  Tiene un socio que no vino a la entrevista.  ");
    expect((await w.repo.projects.get(project.id))?.clientContext).toBe("Tiene un socio que no vino a la entrevista.");
    expect((await errorOf(setClientContext(w.as("men1"), project.id, "x".repeat(8001))))?.code).toBe("validation");
    expect((await errorOf(setClientContext(w.as("ent1"), project.id, "hola")))?.code).toBe("not_found");
  });

  it("Clientes y Bandeja: estado de invitaciones e intake por proyecto, «Intake listo para revisar»", async () => {
    const w = await world();
    const { project } = await groupWithIntakes(w);
    const solo = (await newProject(w, { name: "Solo" })).project;
    const list = await listMentorProjects(w.as("men1"));
    expect(list.map((p) => p.project.name).sort()).toEqual(["Cooperativa", "Solo"]);
    const coop = list.find((p) => p.project.id === project.id)!;
    expect(coop.invitations.map((i) => i.status)).toEqual(["pending", "pending"]);
    expect(coop.intakes.filter((i) => i.clientId).map((i) => i.status).sort()).toEqual(["in_progress", "submitted"]);
    expect(await listMentorProjects(w.as("ent1"))).toEqual([]);
    expect(await listMentorProjects(w.as("men2"))).toEqual([]);

    const inbox = intakeInbox(list.map((m) => ({ id: m.project.id, name: m.project.name, mode: m.project.mode, intakes: m.intakes })));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ kind: "intake_ready", projectId: project.id, tab: "brief" });
    expect(inbox[0].detail).toContain("1 de 2");
    expect(inbox.some((i) => i.projectId === solo.id)).toBe(false);

    await markIntakeReviewed(w.as("men1"), project.id);
    const after = await listMentorProjects(w.as("men1"));
    expect(intakeInbox(after.map((m) => ({ id: m.project.id, name: m.project.name, mode: m.project.mode, intakes: m.intakes })))).toEqual([]);
  });

  it("individual: el detalle nombra a la persona", () => {
    const [item] = intakeInbox([
      { id: "p1", name: "Uno", mode: "individual", intakes: [{ clientId: "c1", clientName: "Cami", status: "submitted", submittedAt: "2026-11-08T00:00:00.000Z", updatedAt: "2026-11-08T00:00:00.000Z" }] },
    ]);
    expect(item.detail).toContain("Cami");
  });
});
