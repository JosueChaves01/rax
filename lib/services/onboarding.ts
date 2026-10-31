import type { AdminOnboarding, EntrepreneurOnboarding, InitiativeNature, MentorOnboarding, Profile, Project } from "@/types/domain";
import { forbidden, validation } from "@/lib/errors";
import { audit, type ServiceDeps } from "./base";
import { createProject } from "./projects";

export type OnboardingInput =
  | { name: string; profile: EntrepreneurOnboarding; firstProject: { name: string; description: string; nature: InitiativeNature } }
  | { name: string; profile: MentorOnboarding }
  | { name: string; profile: AdminOnboarding };

/**
 * Onboarding según cómo la persona usará RAX:
 * - Emprendedor: contexto y expectativas + su primer proyecto (la entrevista arranca ahí).
 * - Mentor: experiencia y disponibilidad. Queda pendiente hasta que la administración lo apruebe.
 * - Administración: solo para quien ya tiene ese rol (lo asigna otra administración o la base).
 */
export async function completeOnboarding(d: ServiceDeps, input: OnboardingInput): Promise<{ profile: Profile; project?: Project }> {
  const name = input.name.trim();
  if (name.length < 2) throw validation("Contanos cómo te llamás.");
  const intent = input.profile.intent;
  const me = d.actor;

  if (intent === "admin" && me.role !== "admin") throw forbidden();
  if (intent === "entrepreneur" && me.role !== "entrepreneur") throw validation("Tu cuenta ya tiene otro rol en RAX.");
  // Quien fue rechazado como mentor puede volver a postularse con datos nuevos; nadie más repite su bienvenida.
  const reapplying = intent === "mentor" && me.role !== "mentor" && me.mentorStatus === "rejected";
  if (me.onboardedAt && me.onboarding?.intent === intent && !reapplying) throw validation("Ya completaste esta bienvenida.");

  if (intent === "mentor") {
    const m = input.profile as MentorOnboarding;
    if (!m.expertise.length) throw validation("Elegí al menos un área en la que puedas acompañar.");
    if (m.bio.trim().length < 30) throw validation("Contanos un poco más de tu experiencia (al menos 30 caracteres).");
  }
  if (intent === "entrepreneur") {
    const e = input.profile as EntrepreneurOnboarding;
    if (!e.goals.length) throw validation("Elegí al menos una cosa que esperás de RAX.");
  }

  // Quien pide ser mentor queda pendiente; si la administración ya le dio el rol, queda aprobado.
  const mentorStatus = intent === "mentor" ? (me.role === "mentor" ? "approved" : "pending") : me.mentorStatus;
  const profile = await d.repo.profiles.update(me.id, { name: name.slice(0, 120), onboarding: input.profile, onboardedAt: d.now(), mentorStatus });
  await audit(d, intent === "mentor" && mentorStatus === "pending" ? "mentor.applied" : "profile.onboarded", { targetId: me.id, meta: { intent } });

  if (intent === "entrepreneur" && "firstProject" in input) {
    const project = await createProject({ ...d, actor: profile }, input.firstProject);
    return { profile, project };
  }
  return { profile };
}
