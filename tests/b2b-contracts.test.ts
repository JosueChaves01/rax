import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { createPgRepository } from "@/lib/data/supabase-repository";
import type { Db, Row } from "@/lib/data/db";
import { isDomainError } from "@/lib/errors";
import { can } from "@/lib/authz";
import { isB2BFlow } from "@/lib/flags";
import { toolsFor } from "@/lib/ai/tools/registry";
import { MENTOR_TOOLS } from "@/lib/ai/tools/mentor";
import { CLIENT_TOOLS } from "@/lib/ai/tools/client";
import type { ServiceDeps } from "@/lib/services/base";
import * as mentorProfile from "@/lib/services/mentor-profile";
import * as mentorKnowledge from "@/lib/services/mentor-knowledge";
import * as mentorProjects from "@/lib/services/mentor-projects";
import * as sessionRoom from "@/lib/services/session-room";
import * as publishing from "@/lib/services/publishing";
import * as invitations from "@/lib/services/invitations";
import * as cycle from "@/lib/services/cycle";
import * as assessments from "@/lib/services/assessments";
import * as clientPortal from "@/lib/services/client-portal";
import * as notifications from "@/lib/services/notifications";
import * as mentorContext from "@/lib/ai/mentor-context";
import { B2B_PEOPLE, fakeBuildMentorContext, notifySpy, sampleIntakeBrief, sampleMentorProfile } from "./fixtures/b2b";

const STUB_MODULES = {
  mentorProfile,
  mentorKnowledge,
  mentorProjects,
  sessionRoom,
  publishing,
  invitations,
  cycle,
  assessments,
  clientPortal,
  notifications,
  mentorContext,
};

/** Funciones de contrato que ya tienen implementación real (Fase 1 en adelante): no se cuentan como stubs. */
const IMPLEMENTED = new Set([
  // Dev A · Fase 1
  "getMentorProfile",
  "saveMentorProfile",
  "addMentorDocument",
  "deleteMentorDocument",
  "getMentorKnowledgeContext",
  "buildMentorContext",
  // Dev A · Fase 2
  "createProjectAsMentor",
  "inviteClient",
  "revokeInvitation",
  "setClientContext",
  "markIntakeReviewed",
  // Dev B · Fase 2
  "notify",
  "listNotifications",
  "markNotificationRead",
  "listMyInvitations",
  "respondInvitation",
  "syncPendingInvitations",
  "getClientHome",
  "scheduleCycleSession",
  "advanceCycleStage",
]);
/** Exportaciones nuevas, fuera del contrato de Fase 0 (ayudantes de los servicios ya implementados). */
const EXTRA_EXPORTS = new Set([
  "defaultMentorProfile",
  "loadMentorProfile",
  "listMentorDocuments",
  "importMentorResourcesToKnowledge",
  // Dev A · Fase 2 (mentor-projects.ts)
  "normalizeEmail",
  "getIntakeBriefsForMentor",
  "listMentorProjects",
  // Dev B · Fase 2
  "markNotificationsReadWhere",
  "onIntakeSubmitted",
  "canAdvance",
  "stageOfProject",
  "cleanAgenda",
  "nextSessionOf",
]);

const deps = { repo: createMemoryRepository(), actor: B2B_PEOPLE[0] } as unknown as ServiceDeps;

describe("contratos del pivot B2B (Fase 0)", () => {
  it("cada servicio de contrato lanza notImplemented hasta que se implemente", async () => {
    let count = 0;
    for (const [mod, exports] of Object.entries(STUB_MODULES)) {
      for (const [name, fn] of Object.entries(exports)) {
        if (typeof fn !== "function" || IMPLEMENTED.has(name) || EXTRA_EXPORTS.has(name)) continue;
        count++;
        const err = await (fn as (...a: unknown[]) => Promise<unknown>)(deps, "x", "y").then(
          () => null,
          (e: unknown) => e,
        );
        expect(isDomainError(err), `${mod}.${name}`).toBe(true);
        expect((err as { code: string }).code, `${mod}.${name}`).toBe("not_implemented");
        expect((err as Error).message).toContain(name);
      }
    }
    // intake.ts (4 contratos) ya no está en STUB_MODULES; IMPLEMENTED lista lo de Dev A.
    expect(count).toBe(32 - IMPLEMENTED.size);
  });

  it("el repositorio en memoria tiene las tablas nuevas", async () => {
    const repo = createMemoryRepository();
    const profile = sampleMentorProfile();
    await repo.mentorProfiles.insert({ ...profile, id: profile.mentorId });
    expect((await repo.mentorProfiles.get("u_mara"))?.headline).toBe(profile.headline);
    await repo.intakeBriefs.insert({
      id: "ib_1", projectId: "p1", clientId: "u_cami", status: "submitted", guideSnapshot: profile.interviewGuide,
      coverage: { q_negocio: "answered" }, brief: sampleIntakeBrief(), createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
    });
    expect(await repo.intakeBriefs.count({ projectId: "p1" })).toBe(1);
    for (const table of ["mentorDocuments", "mentorDocumentChunks", "projectInvitations", "notifications", "assessments", "assessmentSubmissions"] as const) {
      expect(await repo[table].list()).toEqual([]);
    }
  });

  it("el repositorio de Postgres mapea las tablas nuevas a snake_case", async () => {
    const inserted: Array<{ table: string; row: Row }> = [];
    const db: Db = {
      async select() {
        return [];
      },
      async insert(table, row) {
        inserted.push({ table, row });
        return { ...row, created_at: "2026-11-07T00:00:00.000Z", updated_at: "2026-11-07T00:00:00.000Z" };
      },
      async update() {
        return [];
      },
    };
    const repo = createPgRepository(db);
    const profile = sampleMentorProfile();
    const saved = await repo.mentorProfiles.insert({ ...profile, id: profile.mentorId });
    expect(inserted[0]).toMatchObject({ table: "mentor_profiles", row: { mentor_id: "u_mara", focus_areas: ["finanzas", "ventas"] } });
    expect(inserted[0].row).not.toHaveProperty("updated_at");
    expect(saved.id).toBe("u_mara");
    await repo.projectInvitations.insert({ id: "i1", projectId: "p1", email: "cami@demo.rax", invitedBy: "u_mara", status: "pending", createdAt: "2026-11-07T00:00:00.000Z" });
    expect(inserted[1]).toMatchObject({ table: "project_invitations", row: { project_id: "p1", invited_by: "u_mara", email: "cami@demo.rax" } });
    const notif = await repo.notifications.insert({ id: "n1", profileId: "u_cami", kind: "project_invitation", payload: { projectId: "p1" }, createdAt: "2026-11-07T00:00:00.000Z" });
    expect(notif.payload).toEqual({ projectId: "p1" });
  });

  it("los fakes de contrato cumplen las firmas", async () => {
    const ctx = await fakeBuildMentorContext(createMemoryRepository(), "u_mara", "¿cómo reviso el margen?");
    expect(ctx.text).toContain("<mentor_context>");
    expect(ctx.citations[0].documentId).toBe("mdoc_metodo");
    const spy = notifySpy();
    await spy.notify(deps, "u_cami", "project_invitation", { projectId: "p1" });
    expect(spy.sent).toHaveLength(1);
  });

  it("las acciones nuevas no cambian los permisos actuales", () => {
    const [mentor, client] = B2B_PEOPLE;
    const legacy = { isOwner: false, isCollaborator: false, isAssignedMentor: true };
    expect(can(mentor, "mentor.note", legacy)).toBe(true);
    expect(can(mentor, "project.update", legacy)).toBe(false);
    expect(can(mentor, "mentor.profile")).toBe(true);
    expect(can(client, "mentor.profile")).toBe(false);
    expect(can(client, "invitation.respond")).toBe(true);
    const asMentor = { isOwner: false, isCollaborator: false, isAssignedMentor: false, isProjectMentor: true };
    const asClient = { isOwner: false, isCollaborator: false, isAssignedMentor: false, isClient: true };
    expect(can(mentor, "document.publish", asMentor)).toBe(true);
    expect(can(client, "document.publish", asClient)).toBe(false);
    expect(can(client, "intake.run", asClient)).toBe(true);
    expect(can(client, "assessment.submit", asClient)).toBe(true);
    expect(can(client, "resource.comment", asClient)).toBe(true);
    // Un cliente no hereda permisos del flujo viejo.
    expect(can(client, "project.read", asClient)).toBe(false);
  });

  it("la bandera RAX_B2B_FLOW está apagada por defecto", () => {
    expect(isB2BFlow({})).toBe(false);
    expect(isB2BFlow({ RAX_B2B_FLOW: "" })).toBe(false);
    expect(isB2BFlow({ RAX_B2B_FLOW: "on" })).toBe(true);
    expect(isB2BFlow({ RAX_B2B_FLOW: "1" })).toBe(true);
  });

  it("el registro de herramientas conserva las de siempre", () => {
    const names = (role: "entrepreneur" | "mentor", scope: Parameters<typeof toolsFor>[1]) => toolsFor(role, scope).map((t) => t.name);
    const plain = { field: false, thread: true, session: false, siblings: false };
    expect(names("entrepreneur", { ...plain, field: true })[0]).toBe("draft_field_value");
    expect(names("entrepreneur", plain).slice(0, 2)).toEqual(["generate_document", "add_document_to_project"]);
    expect(names("entrepreneur", plain)).not.toContain("save_mentor_note");
    expect(names("mentor", plain)).toContain("save_mentor_note");
    expect(names("entrepreneur", { ...plain, session: true, siblings: true }).slice(0, 3)).toEqual(["update_session_notes", "read_session_thread", "generate_document"]);
    expect(names("mentor", { ...plain, b2b: true })).toEqual(names("mentor", plain));
    expect(MENTOR_TOOLS).toEqual([]);
    expect(CLIENT_TOOLS.map((t) => t.definition.name)).toEqual(["record_intake_answer", "finish_intake"]);
    expect(names("entrepreneur", plain)).not.toContain("record_intake_answer");
    expect(names("entrepreneur", { ...plain, b2b: true })).toContain("record_intake_answer");
  });
});
