import { z } from "zod";
import type { Id } from "@/types/domain";
import type { IntakeQuestion, MentorProfile } from "@/types/b2b";
import type { Repository } from "@/lib/data/repository";
import { assertCan } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { sysRepo, type ServiceDeps } from "./base";

/**
 * Perfil del mentor: presentación, metodología, guía de entrevista de intake y tono del asistente.
 * Dueño: Dev A (plan técnico §2.4).
 */

export type MentorProfileInput = Partial<Omit<MentorProfile, "mentorId" | "updatedAt">>;

export const MENTOR_PROFILE_LIMITS = {
  headline: 200,
  bio: 4000,
  methodology: 10_000,
  assistantTone: 2000,
  focusAreas: 20,
  focusArea: 60,
  questions: 40,
  topic: 120,
  question: 500,
  why: 500,
} as const;

const L = MENTOR_PROFILE_LIMITS;

const text = (max: number, label: string) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(max, `${label}: máximo ${max} caracteres.`));

const questionSchema = z.object({
  id: z.string().trim().max(64).optional(),
  topic: text(L.topic, "Tema").pipe(z.string().min(1, "Cada pregunta necesita un tema.")),
  question: text(L.question, "Pregunta").pipe(z.string().min(1, "Cada pregunta necesita su texto.")),
  why: text(L.why, "Para qué sirve").default(""),
  required: z.boolean().default(false),
});

const profileSchema = z
  .object({
    headline: text(L.headline, "Titular"),
    bio: text(L.bio, "Biografía"),
    methodology: text(L.methodology, "Metodología"),
    focusAreas: z.array(z.string()).transform((list) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of list) {
        const v = raw.trim();
        if (!v || seen.has(v.toLowerCase())) continue;
        seen.add(v.toLowerCase());
        out.push(v);
      }
      return out;
    }).pipe(
      z
        .array(z.string().max(L.focusArea, `Cada área de foco: máximo ${L.focusArea} caracteres.`))
        .max(L.focusAreas, `Máximo ${L.focusAreas} áreas de foco.`),
    ),
    interviewGuide: z.array(questionSchema).max(L.questions, `La guía admite hasta ${L.questions} preguntas.`),
    assistantTone: text(L.assistantTone, "Tono del asistente"),
  })
  .partial()
  .strict();

/** Perfil vacío de un mentor que todavía no configuró nada. */
export function defaultMentorProfile(mentorId: Id, updatedAt = ""): MentorProfile {
  return { mentorId, headline: "", bio: "", methodology: "", focusAreas: [], interviewGuide: [], assistantTone: "", updatedAt };
}

/** Lee el perfil sin permisos (repositorio del sistema); sin fila, el perfil vacío. */
export async function loadMentorProfile(repo: Repository, mentorId: Id): Promise<MentorProfile> {
  const row = await repo.mentorProfiles.get(mentorId);
  if (!row) return defaultMentorProfile(mentorId);
  const { id: _id, ...profile } = row;
  void _id;
  return { ...profile, mentorId, focusAreas: profile.focusAreas ?? [], interviewGuide: profile.interviewGuide ?? [] };
}

/**
 * Perfil del mentor indicado o, sin `mentorId`, el de quien tiene la sesión. Otra persona solo lee
 * el perfil de un mentor con el que comparte un proyecto (p. ej. el cliente durante el intake).
 */
export async function getMentorProfile(d: ServiceDeps, mentorId?: Id): Promise<MentorProfile> {
  const id = mentorId ?? d.actor.id;
  if (id === d.actor.id) {
    assertCan(d.actor, "mentor.profile");
    return loadMentorProfile(d.repo, id);
  }
  if (!(await sharesProjectWith(d, id))) throw notFound("Perfil no encontrado.");
  // RLS solo deja leer el perfil propio: ya verificado el vínculo, se lee con permisos de sistema.
  return loadMentorProfile(sysRepo(d), id);
}

async function sharesProjectWith(d: ServiceDeps, mentorId: Id): Promise<boolean> {
  const projects = await d.repo.projects.list({ mentorId });
  for (const p of projects) {
    if (p.mentorId !== mentorId) continue;
    if (p.ownerId === d.actor.id) return true;
    if ((await d.repo.projectMembers.list({ projectId: p.id, profileId: d.actor.id })).length > 0) return true;
  }
  return false;
}

/** Guarda los cambios del perfil del mentor que tiene la sesión. */
export async function saveMentorProfile(d: ServiceDeps, input: MentorProfileInput): Promise<MentorProfile> {
  assertCan(d.actor, "mentor.profile");
  const parsed = profileSchema.safeParse(input ?? {});
  if (!parsed.success) throw validation(parsed.error.issues[0]?.message ?? "Revisa los datos del perfil.");
  const patch = parsed.data;

  const current = await d.repo.mentorProfiles.get(d.actor.id);
  const base = current ? await loadMentorProfile(d.repo, d.actor.id) : defaultMentorProfile(d.actor.id);
  const next: MentorProfile = {
    ...base,
    ...(patch.headline !== undefined && { headline: patch.headline }),
    ...(patch.bio !== undefined && { bio: patch.bio }),
    ...(patch.methodology !== undefined && { methodology: patch.methodology }),
    ...(patch.focusAreas !== undefined && { focusAreas: patch.focusAreas }),
    ...(patch.assistantTone !== undefined && { assistantTone: patch.assistantTone }),
    ...(patch.interviewGuide !== undefined && { interviewGuide: withIds(d, patch.interviewGuide) }),
    mentorId: d.actor.id,
    updatedAt: d.now(),
  };

  const { mentorId, ...fields } = next;
  const saved = current
    ? await d.repo.mentorProfiles.update(mentorId, fields)
    : await d.repo.mentorProfiles.insert({ id: mentorId, mentorId, ...fields });
  const { id: _id, ...profile } = saved;
  void _id;
  return { ...profile, mentorId };
}

/** Conserva los ids existentes (las respuestas del intake los referencian) y asigna uno a las nuevas. */
function withIds(d: ServiceDeps, guide: Array<Omit<IntakeQuestion, "id"> & { id?: string }>): IntakeQuestion[] {
  const used = new Set<string>();
  return guide.map((q) => {
    let id = q.id && !used.has(q.id) ? q.id : "";
    if (!id) do id = d.newId("iq"); while (used.has(id));
    used.add(id);
    return { id, topic: q.topic, question: q.question, why: q.why, required: q.required };
  });
}
