import type { Id, KnowledgeCitation, Profile } from "@/types/domain";
import type {
  Assessment,
  IntakeBrief,
  IntakeQuestion,
  MentorContext,
  MentorDocument,
  MentorProfile,
  Notification,
  NotificationKind,
  ProjectInvitation,
} from "@/types/b2b";
import type { Repository } from "@/lib/data/repository";
import type { buildMentorContext } from "@/lib/ai/mentor-context";
import type { notify } from "@/lib/services/notifications";

/**
 * Fakes de contrato del pivot B2B (plan técnico §3, regla 3). Mientras el servicio del otro dev no
 * exista, se usa esto en las pruebas; nunca se implementa «provisional» la parte del otro.
 * Personas y datos ficticios; solo para tests.
 */

const AT = "2026-11-07T12:00:00.000Z";

export const B2B_PEOPLE: Profile[] = [
  { id: "u_mara", name: "Mara Solís", email: "mara@demo.rax", role: "mentor", mentorStatus: "approved", onboardedAt: AT, createdAt: AT },
  { id: "u_cami", name: "Cami Brenes", email: "cami@demo.rax", role: "entrepreneur", mentorStatus: "none", onboardedAt: AT, createdAt: AT },
  { id: "u_beto", name: "Beto Ureña", email: "beto@demo.rax", role: "entrepreneur", mentorStatus: "none", onboardedAt: AT, createdAt: AT },
];

export const SAMPLE_INTERVIEW_GUIDE: IntakeQuestion[] = [
  { id: "q_negocio", topic: "Negocio", question: "¿Qué vendes y a quién?", why: "Ubicar el modelo antes de la Sesión 1.", required: true },
  { id: "q_dolor", topic: "Problema", question: "¿Qué te quita el sueño hoy del negocio?", why: "Priorizar la agenda.", required: true },
  { id: "q_numeros", topic: "Números", question: "¿Cuánto vendes en un mes normal?", why: "Dimensionar metas realistas.", required: false },
];

export function sampleMentorProfile(mentorId: Id = "u_mara"): MentorProfile {
  return {
    mentorId,
    headline: "Mentora de comercios de barrio",
    bio: "Quince años acompañando pequeños comercios.",
    methodology: "Primero los números del mes, después el cliente, por último el crecimiento.",
    focusAreas: ["finanzas", "ventas"],
    interviewGuide: SAMPLE_INTERVIEW_GUIDE,
    assistantTone: "Cercano y directo, de tú.",
    updatedAt: AT,
  };
}

export function sampleMentorDocument(mentorId: Id = "u_mara"): MentorDocument {
  return {
    id: "mdoc_metodo",
    mentorId,
    title: "Método de los tres números",
    filename: "metodo.md",
    content: "# Método\nVentas, margen y caja: revísalos cada semana.",
    fileType: "markdown",
    tokenCount: 20,
    kind: "methodology",
    createdAt: AT,
    updatedAt: AT,
  };
}

export function sampleIntakeBrief(): IntakeBrief {
  return {
    summary: "Panadería de barrio con ventas estables y caja apretada a fin de mes.",
    answers: [
      { questionId: "q_negocio", topic: "Negocio", answer: "Pan y repostería para el barrio.", confidence: "high" },
      { questionId: "q_dolor", topic: "Problema", answer: "No sabe si gana dinero con la repostería.", confidence: "medium" },
    ],
    gaps: ["Ventas mensuales sin confirmar"],
    risks: ["Caja negativa en temporada baja"],
    suggestedAgenda: [{ id: "t_margen", title: "Margen por producto", goal: "Saber qué deja dinero", status: "planned" }],
    generatedAt: AT,
    model: "fake",
  };
}

export function sampleInvitation(projectId: Id = "prj_panaderia", email = "cami@demo.rax"): ProjectInvitation {
  return { id: "inv_cami", projectId, email, invitedBy: "u_mara", status: "pending", createdAt: AT };
}

export function sampleAssessment(projectId: Id = "prj_panaderia"): Assessment {
  return {
    id: "asm_margen",
    projectId,
    createdBy: "u_mara",
    title: "¿Cuánto te deja cada producto?",
    instructions: "Responde con tus números de la última semana.",
    questions: [{ id: "aq1", kind: "open", prompt: "¿Cuál es tu producto con más margen?" }],
    status: "published",
    createdAt: AT,
    publishedAt: AT,
  };
}

/** Fake de `buildMentorContext` (Dev A) para el entrevistador y el asistente del cliente (Dev B). */
export const fakeBuildMentorContext: typeof buildMentorContext = async (_repo: Repository, mentorId: Id, query: string): Promise<MentorContext> => {
  const profile = sampleMentorProfile(mentorId);
  const doc = sampleMentorDocument(mentorId);
  const citation: KnowledgeCitation = { documentId: doc.id, filename: doc.filename, title: doc.title, chunkIndex: 0, snippet: doc.content.slice(0, 120) };
  return {
    text: `<mentor_context>\n${profile.headline}\nMetodología: ${profile.methodology}\nConsulta: ${query}\n[${doc.title}] ${doc.content}\n</mentor_context>`,
    citations: [citation],
  };
};

/** Fake de `notify` (Dev B) que guarda en memoria lo que se notificó, para las pruebas de Dev A. */
export function notifySpy() {
  const sent: Notification[] = [];
  const fn: typeof notify = async (_d, profileId: Id, kind: NotificationKind, payload: Record<string, unknown>) => {
    const n: Notification = { id: `ntf_${sent.length + 1}`, profileId, kind, payload, createdAt: AT };
    sent.push(n);
    return n;
  };
  return { notify: fn, sent };
}
