import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world, INTERVIEW } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { changeItem, confirmSummary } from "@/lib/services/diagnosis";
import { assignMentor } from "@/lib/services/admin";
import {
  approveHypothesis,
  createExperiment,
  createTasksBatch,
  markExperimentReady,
  proposeHypothesis,
  submitHypothesis,
  suggestExperiment,
  suggestExperimentTasks,
  suggestHypotheses,
  updateExperiment,
} from "@/lib/services/validation";
import { hypothesisIssues } from "@/features/hypotheses/rules";
import { missingForReady } from "@/features/experiments/rules";

afterAll(closeWorlds);

describe("Asistencia de IA en Etapa 3 (Hipótesis y Experimentos)", () => {
  it("genera sugerencias de hipótesis contrastables a partir del contexto y permite guardarlas como borrador", async () => {
    const { as, repo } = await world();
    const ent = as("ent1");
    const otherUser = as("ent2");

    // 1. Crear proyecto, entrevista y confirmación de resumen
    const p = await createProject(ent, {
      name: "LogiRuta",
      description: "Optimización de rutas para pymes de transporte",
      nature: "exploring_idea",
    });

    for (const msg of INTERVIEW) {
      await sendMessage(ent, p.id, msg);
    }
    await confirmSummary(ent, p.id);

    // 2. Priorizar el problema principal en el diagnóstico
    const ws1 = await getWorkspace(ent, p.id);
    const problemItem = ws1.items.find((i) => i.category === "problem");
    expect(problemItem).toBeDefined();

    if (problemItem) {
      await changeItem(ent, problemItem.id, { kind: "prioritize", rank: 1, rationale: "Dolor crítico que causa retrasos diarios" }, problemItem.version);
    }

    // 3. Verificación de permisos: un usuario ajeno no puede pedir sugerencias (not_found)
    await expect(suggestHypotheses(otherUser, p.id)).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 4. Solicitar sugerencias de hipótesis como emprendedor
    const hypSuggestions = await suggestHypotheses(ent, p.id);

    expect(hypSuggestions.suggestions).toBeDefined();
    expect(hypSuggestions.suggestions.length).toBeGreaterThanOrEqual(2);

    // Cada sugerencia debe cumplir estrictamente las reglas metodológicas de RAX
    for (const s of hypSuggestions.suggestions) {
      expect(s.statement.length).toBeGreaterThanOrEqual(25);
      expect(s.segment.trim().length).toBeGreaterThan(0);
      expect(s.evaluationCriterion.trim().length).toBeGreaterThan(0);
      expect(hypothesisIssues(s)).toHaveLength(0); // Sin errores de vaguedad ni brevedad
    }

    // Se registró evento de auditoría
    const auditEvents = await repo.auditEvents.list({ projectId: p.id, action: "ai.invoked" });
    expect(auditEvents.some((a) => a.meta?.task === "hypothesis_suggestion")).toBe(true);

    // 5. Guardar la primera hipótesis sugerida como borrador
    const chosenHyp = hypSuggestions.suggestions[0];
    const createdHyp = await proposeHypothesis(ent, p.id, {
      statement: chosenHyp.statement,
      segment: chosenHyp.segment,
      whyItMatters: chosenHyp.whyItMatters,
      currentEvidence: chosenHyp.currentEvidence,
      uncertainty: chosenHyp.uncertainty,
      costOfBeingWrong: chosenHyp.costOfBeingWrong,
      evaluationCriterion: chosenHyp.evaluationCriterion,
      relatedItemId: chosenHyp.relatedItemId ?? undefined,
    });

    expect(createdHyp.status).toBe("draft");
    expect(createdHyp.statement).toBe(chosenHyp.statement);

    // Verificar que aparece en el workspace
    const ws2 = await getWorkspace(ent, p.id);
    expect(ws2.hypotheses.some((h) => h.id === createdHyp.id)).toBe(true);
  });

  it("diseña experimentos con IA como borradores (design) para que el mentor los edite y confirme (ready)", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const otherMentor = as("men2");
    const adm = as("adm");

    // 1. Proyecto con mentor asignado
    const p = await createProject(ent, {
      name: "AgroData",
      description: "Sensores de humedad para pequeños agricultores",
      nature: "designing_solution",
    });
    await assignMentor(adm, p.id, id("men1"));

    // 2. Crear y someter hipótesis a aprobación
    const hyp = await proposeHypothesis(ent, p.id, {
      statement: "Al menos 5 de 15 productores agrícolas de la zona norte pagarán un adelanto por instalar un sensor piloto en sus cultivos.",
      segment: "Pequeños productores agrícolas con cultivos de riego",
      whyItMatters: "Comprueba si hay disposición real de pago antes de fabricar más dispositivos.",
      currentEvidence: "Charlas informales con productores locales.",
      uncertainty: "high",
      costOfBeingWrong: "Producir inventario de sensores que nadie compre.",
      evaluationCriterion: "Al menos 33% de los productores pagan el depósito del piloto.",
    });

    // Enviar a aprobación
    await submitHypothesis(ent, hyp.id);

    // 3. Un experimento no puede diseñarse si la hipótesis no está aprobada
    await expect(suggestExperiment(mentor, p.id, hyp.id)).rejects.toThrow(/aprobadas/);

    // El mentor aprueba la hipótesis
    const approvedHyp = await approveHypothesis(mentor, hyp.id);
    expect(approvedHyp.status).toBe("approved");

    // 4. Verificación de permisos para diseñar experimentos
    await expect(suggestExperiment(otherMentor, p.id, hyp.id)).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 5. El mentor o emprendedor solicita diseño de experimento con IA
    const expSuggestion = await suggestExperiment(mentor, p.id, hyp.id);

    expect(expSuggestion.question).toBeDefined();
    expect(expSuggestion.method).toBeDefined();
    expect(expSuggestion.participants).toBeDefined();
    expect(expSuggestion.metric).toBeDefined();
    expect(expSuggestion.successCriterion).toBeDefined();
    expect(expSuggestion.rejectionCriterion).toBeDefined();
    expect(expSuggestion.evidencePlan).toBeDefined();
    expect(expSuggestion.activities.length).toBeGreaterThan(0);

    // Se registró auditoría para experiment_suggestion
    const auditEvents = await repo.auditEvents.list({ projectId: p.id, action: "ai.invoked" });
    expect(auditEvents.some((a) => a.meta?.task === "experiment_suggestion")).toBe(true);

    // 6. Crear el experimento sugerido como borrador en diseño (design)
    const expDraft = await createExperiment(mentor, hyp.id, {
      question: expSuggestion.question,
      method: expSuggestion.method,
      participants: expSuggestion.participants,
      activities: expSuggestion.activities,
      resources: expSuggestion.resources,
      budget: expSuggestion.budget,
      durationDays: expSuggestion.durationDays,
      metric: expSuggestion.metric,
      successCriterion: expSuggestion.successCriterion,
      rejectionCriterion: expSuggestion.rejectionCriterion,
      risks: expSuggestion.risks,
      evidencePlan: expSuggestion.evidencePlan,
    });

    expect(expDraft.status).toBe("design");

    // 7. El mentor modifica el diseño del borrador (ej. ajusta la métrica y duración)
    const updatedDraft = await updateExperiment(
      mentor,
      expDraft.id,
      {
        metric: "Cantidad de productores que firman acuerdo piloto y entregan anticipo de $50 USD",
        durationDays: 14,
      },
      expDraft.version,
    );

    expect(updatedDraft.metric).toContain("$50 USD");
    expect(updatedDraft.durationDays).toBe(14);
    expect(updatedDraft.status).toBe("design");

    // No faltan campos obligatorios para quedar listo
    expect(missingForReady(updatedDraft)).toHaveLength(0);

    // 8. Confirmar el diseño: Marcar listo (ready)
    const readyExp = await markExperimentReady(mentor, expDraft.id);
    expect(readyExp.status).toBe("ready");

    // Verificar en el workspace
    const ws = await getWorkspace(mentor, p.id);
    const inWs = ws.experiments.find((e) => e.id === expDraft.id);
    expect(inWs?.status).toBe("ready");
    expect(inWs?.metric).toContain("$50 USD");
  });

  it("genera tareas operativas con IA para los experimentos en base a su contexto y permite crearlas en lote", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const stranger = as("ent2");
    const adm = as("adm");

    // 1. Proyecto con mentor y una hipótesis aprobada
    const p = await createProject(ent, {
      name: "SmartRetail",
      description: "Analítica de tráfico peatonal para comercios minoristas",
      nature: "designing_solution",
    });
    await assignMentor(adm, p.id, id("men1"));

    const hyp = await proposeHypothesis(ent, p.id, {
      statement: "Al menos 8 de 20 dueños de locales comerciales permitirán instalar un sensor de prueba por 2 semanas tras una demostración.",
      segment: "Dueños de comercios minoristas en centros comerciales",
      whyItMatters: "Verifica si los comerciantes confían en la instalación física en sus tiendas.",
      currentEvidence: "No hay evidencia directa previa",
      uncertainty: "high",
      costOfBeingWrong: "Diseñar una solución que nadie permita instalar físicamente.",
      evaluationCriterion: "Al menos 40% de aprobación para colocación de sensores piloto.",
    });
    await submitHypothesis(ent, hyp.id);
    await approveHypothesis(mentor, hyp.id);

    // 2. Crear experimento con actividades, recursos, método y métrica definidos
    const exp = await createExperiment(ent, hyp.id, {
      question: "¿Permitirán los comerciantes minoristas colocar sensores piloto en sus locales?",
      method: "Visitas presenciales y demostración con dispositivo prototipo",
      participants: "20 dueños o encargados de locales minoristas en centros comerciales",
      activities: [
        "Preparar 5 prototipos funcionales de sensores con batería",
        "Confeccionar guía de visita y ficha de consentimiento de instalación",
        "Recorrer los locales seleccionados y realizar la demostración presencial",
        "Instalar sensores en los locales que den consentimiento",
        "Descargar datos tras 14 días y recopilar feedback del comerciante",
      ],
      resources: "5 dispositivos prototipo, guía de visita, hojas de consentimiento",
      budget: 150,
      durationDays: 14,
      metric: "Porcentaje de comercios que aceptan la colocación del sensor piloto",
      successCriterion: "Al menos 8 de 20 locales (≥40%) aceptan la instalación",
      rejectionCriterion: "Menos de 3 locales (<15%) dan su autorización",
      risks: "Desconfianza sobre privacidad de clientes o consumo eléctrico del sensor",
      evidencePlan: "Fichas de consentimiento firmadas y fotografías del sensor instalado",
    });

    // 3. Control de acceso: un usuario ajeno al proyecto no puede generar tareas
    await expect(suggestExperimentTasks(stranger, p.id, exp.id)).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 4. Generar tareas operativas con IA para el experimento
    const taskSuggestion = await suggestExperimentTasks(ent, p.id, exp.id);

    expect(taskSuggestion.tasks).toBeDefined();
    expect(taskSuggestion.tasks.length).toBeGreaterThanOrEqual(3);

    // Cada tarea debe tener título concreto y válido
    for (const t of taskSuggestion.tasks) {
      expect(t.title.trim().length).toBeGreaterThanOrEqual(3);
      expect(t.title.length).toBeLessThanOrEqual(200);
    }

    // Se registró auditoría
    const auditEvents = await repo.auditEvents.list({ projectId: p.id, action: "ai.invoked" });
    expect(auditEvents.some((a) => a.meta?.task === "experiment_tasks_suggestion")).toBe(true);

    // 5. Crear tareas en lote asociadas al experimento
    const selectedToCreate = taskSuggestion.tasks.slice(0, 3).map((t) => ({
      title: t.title,
      experimentId: exp.id,
    }));

    const createdTasks = await createTasksBatch(ent, p.id, selectedToCreate);
    expect(createdTasks).toHaveLength(3);
    for (const ct of createdTasks) {
      expect(ct.experimentId).toBe(exp.id);
      expect(ct.status).toBe("todo");
      expect(ct.projectId).toBe(p.id);
    }

    // Verificar que las tareas aparecen asociadas al experimento en el workspace
    const ws = await getWorkspace(ent, p.id);
    const expTasksInWs = ws.tasks.filter((t) => t.experimentId === exp.id);
    expect(expTasksInWs).toHaveLength(3);

    // 6. Al pedir nuevas sugerencias, el asistente conoce las tareas existentes y no las duplica
    const nextSuggestion = await suggestExperimentTasks(ent, p.id, exp.id);
    const createdTitles = new Set(createdTasks.map((t) => t.title.toLowerCase().trim()));
    for (const t of nextSuggestion.tasks) {
      expect(createdTitles.has(t.title.toLowerCase().trim())).toBe(false);
    }
  });
});
