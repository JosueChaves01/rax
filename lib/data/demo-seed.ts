import type { Profile } from "@/types/domain";
import type { Repository } from "./repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import type { ServiceDeps } from "@/lib/services/base";
import { createProject } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { addItem, changeItem, confirmSummary } from "@/lib/services/diagnosis";
import { addNote, completeFirstReview, requestReview, startSession } from "@/lib/services/mentoring";
import { assignMentor } from "@/lib/services/admin";
import {
  addEvidence,
  approveHypothesis,
  createExperiment,
  createTask,
  markExperimentReady,
  proposeHypothesis,
  recordResult,
  startExperiment,
  submitHypothesis,
} from "@/lib/services/validation";

/**
 * DATOS DE DEMOSTRACIÓN. Personas, proyectos y conversaciones ficticias.
 * Se generan llamando a los MISMOS servicios que usa la aplicación (no hay lógica duplicada),
 * con un reloj determinista. Todo proyecto creado aquí queda marcado isDemo=true.
 */
export const DEMO_PROFILES: Profile[] = [
  { id: "u_ana", name: "Ana Rojas", email: "ana@demo.rax", role: "entrepreneur", createdAt: "2026-09-01T12:00:00.000Z" },
  { id: "u_luis", name: "Luis Mora", email: "luis@demo.rax", role: "entrepreneur", createdAt: "2026-09-01T12:00:00.000Z" },
  { id: "u_carla", name: "Carla Jiménez", email: "carla@demo.rax", role: "mentor", createdAt: "2026-09-01T12:00:00.000Z" },
  { id: "u_diego", name: "Diego Vargas", email: "diego@demo.rax", role: "mentor", createdAt: "2026-09-01T12:00:00.000Z" },
  { id: "u_admin", name: "Equipo RAX", email: "admin@demo.rax", role: "admin", createdAt: "2026-09-01T12:00:00.000Z" },
];

export const DEMO_DESCRIPTIONS: Record<string, string> = {
  u_ana: "Emprendedora con un proyecto avanzado: ya tiene un experimento con resultado negativo.",
  u_luis: "Emprendedor que recién empieza a contar su idea.",
  u_carla: "Mentora asignada al proyecto de Ana.",
  u_diego: "Mentor sin proyectos asignados (sirve para comprobar el aislamiento).",
  u_admin: "Gestiona personas y asignaciones; no ve el contenido de los proyectos.",
};

export async function seedDemo(repo: Repository): Promise<void> {
  for (const p of DEMO_PROFILES) await repo.profiles.insert(p);

  let t = Date.parse("2026-10-01T13:00:00.000Z");
  let n = 0;
  const now = () => new Date((t += 7 * 60_000)).toISOString();
  const newId = (prefix: string) => `${prefix}_demo${(++n).toString().padStart(4, "0")}`;
  const ai = new SimulatedProvider();
  const as = (id: string): ServiceDeps => ({ repo, ai, actor: DEMO_PROFILES.find((p) => p.id === id)!, now, newId });
  const ana = as("u_ana");
  const carla = as("u_carla");
  const admin = as("u_admin");

  /* ── Proyecto 1: Ana, recorrido avanzado ── */
  const p1 = await createProject(ana, {
    name: "Almuerzos saludables para oficinas",
    description: "Viandas caseras con entrega en oficinas pequeñas de San José.",
    nature: "exploring_idea",
  });
  await repo.projects.update(p1.id, { isDemo: true });
  const answers = [
    "Estoy explorando la idea. Cocino bien y varias compañeras me piden comida casera.",
    "Hice almuerzos para 6 compañeras durante dos semanas, me pagaban lo que creían justo.",
    "Lo usarían empleados de oficinas pequeñas. No sé si pagaría la empresa o cada persona.",
    "En mi oficina la gente pide comida rápida todos los días y se queja de que es cara y pesada.",
    "Hoy pierden 30 minutos pidiendo y esperando, y terminan comiendo frito. Quisiera que comieran mejor sin perder tiempo.",
    "Hablé con 6 compañeras y vi que 4 repitieron todas las semanas.",
    "Supongo que pagarían más o menos lo mismo que la comida rápida.",
    "Tengo las tardes libres y una cocina en casa. No tengo presupuesto todavía.",
    "Quiero saber si alguien fuera de mi círculo pagaría por esto.",
  ];
  for (const a of answers) await sendMessage(ana, p1.id, a);
  await confirmSummary(ana, p1.id);

  // Escenario B: la emprendedora corrige una lectura y rechaza otra.
  const items = await repo.diagnosisItems.list({ projectId: p1.id });
  // La emprendedora revisa lo que se organizó: confirma casi todo y deja dos elementos pendientes.
  const keepPending = new Set(["Objetivo inmediato", "Supuesto declarado"]);
  for (const it of items.filter((i) => i.reviewStatus === "proposed" && !keepPending.has(i.title) && i.title !== "Quién usa y quién paga")) {
    await changeItem(ana, it.id, { kind: "confirm" }, it.version);
  }
  const people = items.find((i) => i.title === "Quién usa y quién paga")!;
  await changeItem(
    ana,
    people.id,
    { kind: "edit", content: "Usarían empleados de oficinas de 5 a 20 personas. No sé todavía si paga la empresa o cada persona.", reason: "Precisar el tamaño de oficina" },
    people.version,
  );
  await addItem(ana, p1.id, {
    category: "financial",
    title: "Costo por porción",
    content: "No conozco el costo real por porción; nunca lo calculé.",
    uncertainty: "unknown",
    infoType: "unknown",
  });
  await addItem(ana, p1.id, {
    category: "legal",
    title: "Permiso sanitario",
    content: "No sé si necesito permiso del Ministerio de Salud para vender comida hecha en casa. Debo consultarlo con una persona profesional.",
    uncertainty: "unknown",
    infoType: "unknown",
  });

  await assignMentor(admin, p1.id, "u_carla");
  const s1 = await requestReview(ana, p1.id, "first_review");
  await startSession(carla, s1.id);
  const problem = (await repo.diagnosisItems.list({ projectId: p1.id })).find((i) => i.title === "Problema percibido")!;
  await addNote(carla, s1.id, "observation", "La evidencia viene de un círculo cercano que ya te conoce; no alcanza para saber si personas desconocidas pagarían.", problem.id);
  await addNote(carla, s1.id, "question", "¿Quién decide el almuerzo en una oficina pequeña: cada persona o quien administra?");
  await changeItem(carla, problem.id, { kind: "prioritize", rank: 1, rationale: "Es el problema con más evidencia y el más barato de investigar." }, problem.version);
  await completeFirstReview(carla, s1.id, "Investigar primero si personas fuera del círculo cercano pagan por adelantado. Precio y permisos quedan como preguntas abiertas.");

  const h = await proposeHypothesis(ana, p1.id, {
    statement: "Al menos 5 de 20 empleados de oficinas pequeñas que no me conocen pagarán por adelantado una semana de almuerzos a ₡3 500 por día.",
    segment: "Empleados de oficinas de 5 a 20 personas en San José",
    whyItMatters: "Si solo compra mi círculo cercano, no hay negocio todavía.",
    currentEvidence: "4 de 6 compañeras repitieron durante dos semanas (círculo cercano).",
    uncertainty: "high",
    costOfBeingWrong: "Invertir en equipo y permisos sin demanda real.",
    evaluationCriterion: "Prepagos de personas desconocidas en una semana de oferta.",
    relatedItemId: problem.id,
  });
  await submitHypothesis(ana, h.id);
  await approveHypothesis(carla, h.id);
  const exp = await createExperiment(ana, h.id, {
    question: "¿Personas que no me conocen pagan por adelantado una semana de almuerzos?",
    method: "Oferta de preventa en 3 oficinas con volante y formulario de pago",
    participants: "Empleados de 3 oficinas pequeñas contactadas por una conocida",
    activities: ["Diseñar volante con menú y precio", "Visitar 3 oficinas", "Registrar prepagos"],
    resources: "Volantes impresos y formulario en línea",
    budget: null,
    durationDays: 7,
    metric: "Cantidad de prepagos de personas desconocidas",
    successCriterion: "5 o más prepagos de 20 personas contactadas",
    rejectionCriterion: "Menos de 2 prepagos",
    risks: "La conocida que presenta la oferta puede influir en la respuesta.",
    evidencePlan: "Captura del formulario y registro de pagos",
  });
  await markExperimentReady(ana, exp.id);
  await startExperiment(ana, exp.id);
  await createTask(ana, p1.id, { title: "Imprimir 30 volantes", experimentId: exp.id });
  await createTask(ana, p1.id, { title: "Consultar requisitos del permiso sanitario" });
  const ev = await addEvidence(ana, p1.id, {
    kind: "note",
    title: "Registro de preventa (DEMO)",
    description: "20 personas contactadas, 1 prepago. Varias dijeron que preferían pagar día a día.",
  });
  await recordResult(ana, exp.id, {
    outcome: "negative",
    observed: "De 20 personas contactadas, 1 pagó por adelantado. 7 pidieron poder pagar por día.",
    metricValue: "1 prepago",
    learnings: "El prepago semanal puede ser la barrera, no necesariamente el producto.",
    limitations: "Solo 3 oficinas y una semana; la presentación la hizo una conocida.",
    evidenceIds: [ev.id],
  });
  await requestReview(ana, p1.id, "second_review");

  /* ── Proyecto 2: Luis, recién empieza ── */
  const luis = as("u_luis");
  const p2 = await createProject(luis, {
    name: "Taller de bicicletas a domicilio",
    description: "Reparar bicicletas en la casa del cliente.",
    nature: "unknown",
  });
  await repo.projects.update(p2.id, { isDemo: true });
  await sendMessage(luis, p2.id, "No sé bien todavía, creo que es una idea. Arreglo bicis de amigos los fines de semana.");
}
