import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Profile, Project } from "@/types/domain";
import type { ServiceDeps } from "@/lib/services/base";
import type { Repository } from "@/lib/data/repository";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { B2B_STAGES, STAGES, b2bProjectTabs, b2bStageOf, b2bStageState, usesB2BStages } from "@/features/projects/stages";
import { getWorkspace } from "@/lib/services/projects";
import { buildJourney } from "@/lib/ai/journey";
import { buildProjectState, renderProjectState } from "@/lib/ai/project-state";
import { renderPlatformGuide } from "@/lib/ai/platform-guide";
import { onSessionClosed, scheduleCycleSession } from "@/lib/services/cycle";
import { B2B_PEOPLE } from "./fixtures/b2b";

/** Fase 3 · línea B2B (Entrevista → Sesión 1 → Ciclo → Cierre) y su recorrido para el agente. */

const AT = "2026-11-09T10:00:00.000Z";
const FUTURE = "2026-11-20T15:00:00.000Z";
const [MARA, CAMI] = B2B_PEOPLE;

let repo: Repository;
let tick = 0;
const as = (actor: Profile): ServiceDeps => ({
  repo,
  ai: new SimulatedProvider(),
  actor,
  now: () => new Date(Date.parse(AT) + ++tick * 1000).toISOString(),
  newId: (p) => `${p}_${++tick}`,
});

const prevFlag = process.env.RAX_B2B_FLOW;

beforeEach(async () => {
  tick = 0;
  process.env.RAX_B2B_FLOW = "on";
  repo = createMemoryRepository();
  for (const p of B2B_PEOPLE) await repo.profiles.insert(p);
  await repo.projects.insert({
    id: "prj_panaderia", mentorId: MARA.id, mode: "individual", cycleStage: "intake", name: "Panadería La Espiga", description: "",
    nature: "operating_business", status: "active", shareConversationWithMentor: false, createdAt: AT, updatedAt: AT,
  } as unknown as Project);
  await repo.projectMembers.insert({ id: "prj_panaderia:u_cami", projectId: "prj_panaderia", profileId: CAMI.id, role: "client", createdAt: AT });
});

afterEach(() => {
  if (prevFlag === undefined) delete process.env.RAX_B2B_FLOW;
  else process.env.RAX_B2B_FLOW = prevFlag;
});

describe("modelo de etapas B2B", () => {
  it("cuatro etapas por cycle_stage; el modelo viejo queda igual", () => {
    expect(B2B_STAGES.map((s) => s.label)).toEqual(["Entrevista", "Sesión 1", "Ciclo", "Cierre"]);
    expect(STAGES.map((s) => s.label)).toEqual(["Entender", "Orientar", "Probar", "Decidir"]);
    expect(b2bStageOf(undefined).id).toBe("intake");
    expect(B2B_STAGES.map((s) => b2bStageState(s, "kickoff"))).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(B2B_STAGES.map((s) => b2bStageState(s, "closed"))).toEqual(["done", "done", "done", "done"]);
  });

  it("solo proyectos con mentor_id y la bandera encendida usan la línea B2B", () => {
    expect(usesB2BStages({ mentorId: "u_mara" }, true)).toBe(true);
    expect(usesB2BStages({ mentorId: "u_mara" }, false)).toBe(false);
    expect(usesB2BStages({}, true)).toBe(false);
  });

  it("pestañas por rol: el mentor ve el brief, el cliente su entrevista, los dos las sesiones", () => {
    expect(b2bProjectTabs(true).map((t) => t.slug)).toEqual(["", "brief", "sesiones"]);
    expect(b2bProjectTabs(false).map((t) => t.slug)).toEqual(["", "intake", "sesiones"]);
  });
});

describe("recorrido y estado del agente en un proyecto B2B", () => {
  it("el recorrido sigue el ciclo real: entrevista, Sesión 1, Sesión 2 sugerida", async () => {
    let j = buildJourney(await getWorkspace(as(MARA), "prj_panaderia"));
    expect(j.flow).toBe("b2b");
    expect(j.steps[j.currentIndex].id).toBe("intake");

    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: [] });
    j = buildJourney(await getWorkspace(as(MARA), "prj_panaderia"));
    expect(j.steps[j.currentIndex].id).toBe("kickoff");

    const closed = await repo.mentorSessions.update(k.id, { status: "completed", completedAt: FUTURE });
    await onSessionClosed(as(MARA), closed);
    const w = await getWorkspace(as(MARA), "prj_panaderia");
    j = buildJourney(w);
    expect(j.steps[j.currentIndex].id).toBe("schedule_follow_up");

    const state = buildProjectState(w, "mentor", AT);
    expect(state).toMatchObject({ flow: "b2b", stage: { id: "cycle", label: "Ciclo" }, next: { turn: "mentor", page: "sesiones" } });
    const text = renderProjectState(state);
    expect(text).toContain('<project_state flow="b2b">');
    expect(text).toContain("Sesión 2");
    expect(text).not.toContain("Diagnóstico vivo");
  });

  it("con la bandera apagada el mismo proyecto usa el recorrido de siempre", async () => {
    process.env.RAX_B2B_FLOW = "";
    const w = await getWorkspace(as(MARA), "prj_panaderia");
    expect(buildJourney(w).flow).toBeUndefined();
    expect(buildProjectState(w, "mentor", AT).flow).toBeUndefined();
  });

  it("la guía de la plataforma describe el flujo B2B por rol solo con la bandera", () => {
    const client = renderPlatformGuide("entrepreneur", { b2b: true });
    expect(client).toContain('flow="b2b"');
    expect(client).toContain("CLIENTE de un mentor");
    expect(client).toContain("(/intake)");
    expect(client).not.toContain("(/brief)");
    const mentor = renderPlatformGuide("mentor", { b2b: true });
    expect(mentor).toContain("MENTORA");
    expect(mentor).toContain("(/brief)");
    const legacy = renderPlatformGuide("entrepreneur", { b2b: false });
    expect(legacy).not.toContain('flow="b2b"');
    expect(legacy).toContain("«Entender»");
  });
});
