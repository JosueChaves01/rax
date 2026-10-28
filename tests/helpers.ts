import type { Profile } from "@/types/domain";
import type { Repository } from "@/lib/data/repository";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import type { AiProvider } from "@/lib/ai/provider";
import type { ServiceDeps } from "@/lib/services/base";

export const PEOPLE: Profile[] = [
  { id: "ent1", name: "Emprendedora Uno", email: "e1@test", role: "entrepreneur", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ent2", name: "Emprendedor Dos", email: "e2@test", role: "entrepreneur", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "men1", name: "Mentora Asignada", email: "m1@test", role: "mentor", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "men2", name: "Mentor Ajeno", email: "m2@test", role: "mentor", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "adm", name: "Admin", email: "a@test", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
];

export async function world(ai: AiProvider = new SimulatedProvider()) {
  const repo: Repository = createMemoryRepository();
  for (const p of PEOPLE) await repo.profiles.insert(p);
  let t = Date.parse("2026-10-01T00:00:00.000Z");
  let n = 0;
  const now = () => new Date((t += 1000)).toISOString();
  const newId = (prefix: string) => `${prefix}_${++n}`;
  const as = (id: string, provider: AiProvider = ai): ServiceDeps => ({ repo, ai: provider, actor: PEOPLE.find((p) => p.id === id)!, now, newId });
  return { repo, as };
}

/** Responde la guía de entrevista con mensajes dados, en orden. */
export const INTERVIEW = [
  "Estoy explorando una idea de lavandería por suscripción para estudiantes.",
  "Le pregunté a 5 compañeros de residencia si la usarían.",
  "La usarían estudiantes que viven solos. Pagarían ellos o sus padres, no estoy seguro.",
  "Vi que en mi residencia nadie tiene lavadora y pierden la tarde en la lavandería.",
  "Pierden tiempo y gastan en lavanderías caras. Quisiera que fuera más simple.",
];
