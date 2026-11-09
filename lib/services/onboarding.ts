import type { AdminOnboarding, EntrepreneurOnboarding, InitiativeNature, MentorOnboarding, Profile, Project } from "@/types/domain";
import { forbidden, validation } from "@/lib/errors";
import { isB2BFlow } from "@/lib/flags";
import { audit, sysRepo, type ServiceDeps } from "./base";
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
  if (isB2BFlow()) return completeB2BOnboarding(d, input);
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

/**
 * Bienvenida del flujo B2B (plan técnico §6.3, sin administración):
 * - «Soy mentor»: queda activo de una vez (rol mentor, aprobado) y sigue en /app/mentor/perfil.
 *   También activa a quien había pedido ser mentor en el flujo viejo y quedó esperando aprobación.
 * - «Vengo a trabajar con un mentor»: cliente. No crea proyecto: entra por invitación del mentor.
 * La administración ya no existe en este flujo.
 */
export async function completeB2BOnboarding(d: ServiceDeps, input: OnboardingInput): Promise<{ profile: Profile; project?: Project }> {
  const name = input.name.trim();
  if (name.length < 2) throw validation("Cuéntanos cómo te llamas.");
  const intent = input.profile.intent;
  const me = d.actor;
  if (intent === "admin") throw forbidden();

  if (intent === "mentor") {
    const m = input.profile as MentorOnboarding;
    // Un mentor que ya pasó por aquí no repite; quien quedó pendiente en el flujo viejo sí se activa.
    if (me.onboardedAt && me.role === "mentor") throw validation("Ya completaste esta bienvenida.");
    if (me.onboardedAt && me.onboarding?.intent !== "mentor") throw validation("Tu cuenta ya está registrada como cliente.");
    if (me.role !== "entrepreneur" && me.role !== "mentor") throw validation("Tu cuenta ya tiene otro rol en RAX.");
    if (!Array.isArray(m.expertise ?? [])) throw validation("Revisa tus áreas de experiencia.");
    // Llega del navegador: se arma de nuevo campo por campo, con límites.
    const count = (v: unknown, max: number) => (Number.isFinite(Number(v)) ? Math.min(Math.max(Math.round(Number(v)), 0), max) : 0);
    const profile: MentorOnboarding = {
      intent: "mentor",
      expertise: [...new Set((m.expertise ?? []).filter((x) => typeof x === "string"))].slice(0, 12),
      sectors: String(m.sectors ?? "").trim().slice(0, 300),
      yearsExperience: m.yearsExperience ?? "3to7",
      monthlyHours: count(m.monthlyHours, 80),
      maxProjects: count(m.maxProjects, 50),
      bio: String(m.bio ?? "").trim().slice(0, 1200),
      ...(typeof m.linkedinUrl === "string" && /^https:\/\//.test(m.linkedinUrl.trim()) ? { linkedinUrl: m.linkedinUrl.trim() } : {}),
    };
    // El rol solo lo cambia el servidor (trigger guard_profile_role): se escribe como sistema tras validar.
    const saved = await sysRepo(d).profiles.update(me.id, {
      name: name.slice(0, 120),
      onboarding: profile,
      onboardedAt: me.onboardedAt ?? d.now(),
      role: "mentor",
      mentorStatus: "approved",
    });
    await audit(d, "profile.onboarded", { targetId: me.id, meta: { intent, b2b: true, selfActivated: true } });
    return { profile: saved };
  }

  if (me.role !== "entrepreneur") throw validation("Tu cuenta ya tiene otro rol en RAX.");
  if (me.onboardedAt) throw validation("Ya completaste esta bienvenida.");
  const e = input.profile as EntrepreneurOnboarding;
  const profile: EntrepreneurOnboarding = {
    intent: "entrepreneur",
    sector: String(e.sector ?? "").trim().slice(0, 120),
    stage: e.stage ?? "unknown",
    goals: Array.isArray(e.goals) ? e.goals : [],
    weeklyHours: e.weeklyHours ?? "2to5",
    mentorExpectation: String(e.mentorExpectation ?? "").trim().slice(0, 600),
  };
  const saved = await d.repo.profiles.update(me.id, { name: name.slice(0, 120), onboarding: profile, onboardedAt: d.now() });
  await audit(d, "profile.onboarded", { targetId: me.id, meta: { intent, b2b: true } });
  return { profile: saved };
}
