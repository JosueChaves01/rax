import "server-only";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import type { Profile } from "@/types/domain";
import { getAiProvider } from "@/lib/ai";
import { defaultClock, type ServiceDeps } from "@/lib/services/base";
import { createPgRepository } from "@/lib/data/supabase-repository";
import { supabaseDb } from "@/lib/data/supabase-db";
import { missingConfig } from "@/lib/supabase/config";
import { createSystemClient, createUserClient } from "@/lib/supabase/server";

/** Sesión real de Supabase Auth: la persona y su perfil, o null si no hay sesión. */
const getSession = cache(async () => {
  // Siempre por pedido: sin esto, una build sin variables prerenderiza las páginas privadas.
  await connection();
  if (missingConfig().length) return null;
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const repo = createPgRepository(supabaseDb(supabase));
  const profile = await repo.profiles.get(user.id);
  return profile ? { repo, profile } : null;
});

export const getActor = cache(async (): Promise<Profile | null> => (await getSession())?.profile ?? null);

/** Dependencias de los servicios para la persona con sesión. */
export async function getDeps(): Promise<ServiceDeps | null> {
  const session = await getSession();
  if (!session) return null;
  return {
    repo: session.repo,
    sys: createPgRepository(supabaseDb(createSystemClient())),
    ai: getAiProvider(),
    actor: session.profile,
    now: defaultClock,
    newId: () => randomUUID(),
  };
}

/** Adónde va cada persona según su rol y su onboarding. */
export function homeFor(p: Profile): string {
  if (!p.onboardedAt || (p.role === "admin" && p.onboarding?.intent !== "admin")) return "/bienvenida";
  if (p.role === "admin") return "/app/admin";
  return "/app";
}
