import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { completeOnboarding } from "@/lib/services/onboarding";
import { adminOverview, assignMentor, reviewMentorApplication } from "@/lib/services/admin";
import { createProject, listMyProjects } from "@/lib/services/projects";
import type { EntrepreneurOnboarding, MentorOnboarding } from "@/types/domain";

afterAll(closeWorlds);

const ENTREPRENEUR: EntrepreneurOnboarding = {
  intent: "entrepreneur",
  sector: "Alimentos",
  stage: "exploring_idea",
  goals: ["order_idea", "find_mentor"],
  weeklyHours: "2to5",
  mentorExpectation: "Que me ayude a no gastar antes de validar.",
};

const MENTOR: MentorOnboarding = {
  intent: "mentor",
  expertise: ["finance", "marketing_sales"],
  sectors: "Alimentos, retail",
  yearsExperience: "8to15",
  monthlyHours: 6,
  maxProjects: 2,
  bio: "Fundé dos negocios de comida y acompaño emprendimientos desde 2018.",
};

describe("Onboarding por tipo de usuario", () => {
  it("la persona emprendedora completa la bienvenida y arranca con su primer proyecto", async () => {
    const w = await world();
    await w.signUp("nueva", "Nueva Persona");
    await expect(createProject(w.as("nueva"), { name: "Antes de tiempo", description: "", nature: "unknown" })).rejects.toMatchObject({ code: expect.stringMatching(/validation|forbidden/) });

    const r = await completeOnboarding(w.as("nueva"), {
      name: "Nueva Persona",
      profile: ENTREPRENEUR,
      firstProject: { name: "Viandas para oficinas", description: "Almuerzos caseros", nature: "exploring_idea" },
    });
    expect(r.project?.name).toBe("Viandas para oficinas");
    await w.reload("nueva");
    const me = w.as("nueva").actor;
    expect(me.onboardedAt).toBeTruthy();
    expect(me.onboarding).toMatchObject({ intent: "entrepreneur", goals: ["order_idea", "find_mentor"] });
    expect((await listMyProjects(w.as("nueva"))).map((p) => p.name)).toEqual(["Viandas para oficinas"]);
    // La conversación arranca con la primera pregunta de la guía.
    expect(await w.repo.messages.list({ projectId: r.project!.id })).toHaveLength(1);
  });

  it("quien pide ser mentor queda pendiente hasta que la administración lo aprueba", async () => {
    const w = await world();
    await w.signUp("mentora", "Mentora Nueva");
    await completeOnboarding(w.as("mentora"), { name: "Mentora Nueva", profile: MENTOR });
    await w.reload("mentora");
    expect(w.as("mentora").actor).toMatchObject({ role: "entrepreneur", mentorStatus: "pending" });
    // Mientras está pendiente no crea proyectos ni puede ser asignada.
    await expect(createProject(w.as("mentora"), { name: "Algo", description: "", nature: "unknown" })).rejects.toMatchObject({ code: "validation" });
    const p = await createProject(w.as("ent1"), { name: "Proyecto", description: "", nature: "unknown" });
    await expect(assignMentor(w.as("adm"), p.id, w.id("mentora"))).rejects.toMatchObject({ code: "validation" });

    // Nadie más que la administración aprueba.
    await expect(reviewMentorApplication(w.as("ent1"), w.id("mentora"), true)).rejects.toMatchObject({ code: "forbidden" });
    const overview = await adminOverview(w.as("adm"));
    expect(overview.pendingMentors.map((m) => m.name)).toEqual(["Mentora Nueva"]);
    await reviewMentorApplication(w.as("adm"), w.id("mentora"), true);
    await w.reload("mentora");
    expect(w.as("mentora").actor).toMatchObject({ role: "mentor", mentorStatus: "approved" });
    await assignMentor(w.as("adm"), p.id, w.id("mentora"));
    const after = await adminOverview(w.as("adm"));
    expect(after.mentorLoad[w.id("mentora")]).toEqual({ active: 1, max: 2 });
  });

  it("la bienvenida de administración es solo para quien ya tiene ese rol", async () => {
    const w = await world();
    await expect(
      completeOnboarding(w.as("ent1"), { name: "Intrusa", profile: { intent: "admin", organization: "X", program: "Y" } }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const r = await completeOnboarding(w.as("adm"), { name: "Equipo RAX", profile: { intent: "admin", organization: "Incubadora", program: "Cohorte 2027" } });
    expect(r.profile.onboarding).toMatchObject({ intent: "admin", organization: "Incubadora" });
  });
});
