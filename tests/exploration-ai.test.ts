import { afterAll, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";

const { getDepsMock } = vi.hoisted(() => ({ getDepsMock: vi.fn() }));
vi.mock("@/lib/runtime", () => ({ getDeps: getDepsMock, homeFor: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { generateMentorshipExplorationData } from "@/lib/ai/exploration-ai";
import {
  completeExplorationAndCreateProjectAction,
  generateMentorshipExplorationWithAiAction,
  loadExplorationContextAction,
} from "@/app/actions";
import { executeWorkflowTool } from "@/lib/ai/workflow-tools";

afterAll(closeWorlds);

describe("Workflow de Exploración y Creación de Proyecto Mentor-Cliente con Asistente de IA", () => {
  it("genera los 4 pasos completos del workflow estructurado con IA", async () => {
    // 1. Caso general por defecto
    const general = await generateMentorshipExplorationData();
    expect(general.initiativeName).toBeTruthy();
    expect(general.sector).toBeTruthy();
    expect(general.nature).toBe("exploring_idea");
    expect(general.motivation).toBe("validate");
    expect(general.description.length).toBeGreaterThan(50);
    expect(general.compatibilityScore).toBeGreaterThanOrEqual(90);
    expect(general.compatibilityRationale).toContain("mentor");
    expect(general.validationGoals.length).toBeGreaterThanOrEqual(2);
    expect(general.frequency).toBe("biweekly");
    expect(general.sessionDurationMinutes).toBe(60);
    expect(general.expectedDurationWeeks).toBe(12);
    expect(general.cycleGoals).toBeTruthy();
    expect(general.scope).toBeTruthy();
    expect(general.mentorCommitments).toBeTruthy();
    expect(general.entrepreneurCommitments).toBeTruthy();
    expect(general.confidentialityTerms).toBeTruthy();

    // 2. Caso con prompt específico de usuario
    const custom = await generateMentorshipExplorationData("Telemedicina para Mascotas");
    expect(custom.initiativeName).toContain("Telemedicina");
    expect(custom.description).toContain("Telemedicina para Mascotas");
    expect(custom.cycleGoals).toContain("Telemedicina para Mascotas");

    // 3. Caso arquetipo salud
    const health = await generateMentorshipExplorationData("Clínica y salud digital");
    expect(health.initiativeName).toBe("KlinicOS");
    expect(health.sector).toContain("HealthTech");
  });

  it("permite cargar el contexto de exploración y lista de mentores disponibles", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    getDepsMock.mockResolvedValue(entrepreneur);

    const context = await loadExplorationContextAction();
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    expect(context.actor.id).toBe("ent1");
    expect(context.mentors.length).toBeGreaterThanOrEqual(1);
    expect(context.mentors.some((m) => m.id === "men1")).toBe(true);
  });

  it("ejecuta la acción del Asistente de IA para generar la propuesta del workflow", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    getDepsMock.mockResolvedValue(entrepreneur);

    const result = await generateMentorshipExplorationWithAiAction("Plataforma SaaS de Facturación B2B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.initiativeName).toContain("Plataforma SaaS");
    expect(result.data.compatibilityScore).toBeGreaterThanOrEqual(90);
    expect(result.data.frequency).toBe("biweekly");
    expect(result.mentorId).toBeTruthy();
  });

  it("crea el nuevo proyecto, asigna al mentor, genera la relación y formaliza el acuerdo", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    getDepsMock.mockResolvedValue(entrepreneur);

    const createRes = await completeExplorationAndCreateProjectAction({
      initiativeName: "PetCare AI",
      sector: "Veterinaria & Salud Animal",
      nature: "designing_solution",
      summary: "Teleorientación veterinaria preventiva con IA",
      motivation: "validate",
      description: "Buscamos validar la tasa de conversión en planes familiares mensuales con 3 clínicas aliadas.",
      mentorId: "men1",
      compatibilityRationale: "Afinidad de mentoría estratégica y experiencia en software de servicios recurrentes.",
      agreement: {
        frequency: "biweekly",
        sessionDurationMinutes: 60,
        expectedDurationWeeks: 12,
        cycleGoals: "Validación de modelo de precios y 15 pre-suscripciones cerradas.",
        scope: "Estrategia de pricing, diseño de entrevistas y experimentos de preventa.",
        mentorCommitments: "Revisión quincenal de métricas y orientación metodológica.",
        entrepreneurCommitments: "Ejecución disciplinada de experimentos y preparación de agenda.",
        confidentialityTerms: "Confidencialidad absoluta de los datos de clínicas y clientes.",
        authorizedChannels: ["virtual", "email", "whatsapp"],
      },
    });

    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;

    const projectId = createRes.projectId;
    const relationId = createRes.relationId;
    expect(projectId).toBeTruthy();
    expect(relationId).toBeTruthy();

    // Verificar en el repositorio
    const project = await entrepreneur.repo.projects.get(projectId);
    expect(project).toBeDefined();
    expect(project?.name).toBe("PetCare AI");
    expect(project?.nature).toBe("designing_solution");
    expect(project?.ownerId).toBe("ent1");
    expect(project?.shareConversationWithMentor).toBe(true);

    const assignments = await entrepreneur.repo.mentorAssignments.list({ projectId, mentorId: "men1", status: "active" });
    expect(assignments).toHaveLength(1);

    const relations = await entrepreneur.repo.mentorshipRelations.list({ projectId });
    expect(relations).toHaveLength(1);
    expect(relations[0].compatibilityStatus).toBe("proceed");
    expect(relations[0].stage).toBe("agreement");

    const agreements = await entrepreneur.repo.mentorshipAgreements.list({ relationId });
    expect(agreements).toHaveLength(1);
    expect(agreements[0].frequency).toBe("biweekly");
    expect(agreements[0].scope).toContain("Estrategia de pricing");

    // Verificar bootstrap completo de workspace (membresía, conversación, diagnóstico y mensaje)
    const members = await entrepreneur.repo.projectMembers.list({ projectId });
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");

    const convs = await entrepreneur.repo.conversations.list({ projectId });
    expect(convs).toHaveLength(1);

    const diags = await entrepreneur.repo.diagnoses.list({ projectId });
    expect(diags).toHaveLength(1);
    expect(diags[0].status).toBe("exploring");

    const msgs = await entrepreneur.repo.messages.list({ projectId });
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("ejecuta la herramienta setup_mentorship_project del agente de IA", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await entrepreneur.repo.projects.insert({
      id: "prj_existing",
      ownerId: "ent1",
      name: "Existing Base",
      description: "Base",
      nature: "exploring_idea",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await executeWorkflowTool(entrepreneur, project.id, "setup_mentorship_project", {
      initiativeName: "BioPack",
      sector: "Sostenibilidad",
      nature: "designing_solution",
      motivation: "validate",
      description: "Empaques biodegradables hechos a partir de bagazo de caña.",
      cycleGoals: "Validar costo unitario y cerrar 2 cartas de intención con restaurantes.",
      frequency: "biweekly",
      scope: "Validación de precio de venta por millar y capacidad de suministro.",
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("BioPack");
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].type).toBe("goal");
    expect(result.proposals[1].type).toBe("task");
  });
});

