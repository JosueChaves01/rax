import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Profile } from "@/types/domain";
import type { Repository } from "@/lib/data/repository";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { seedDemo } from "@/lib/data/demo-seed";
import { getAiProvider } from "@/lib/ai";
import { defaultClock, randomId, type ServiceDeps } from "@/lib/services/base";

export const DEMO_SESSION_COOKIE = "rax_demo_user";

/**
 * Modo de datos. Hoy solo "demo": repositorio en memoria del servidor, sembrado con datos DEMO.
 * Se reinicia al reiniciar el servidor (y en Vercel, por instancia). La implementación Supabase
 * se conecta aquí cuando existan credenciales (ver docs/architecture.md §Persistencia).
 */
export const DATA_MODE = "demo" as const;

const g = globalThis as unknown as { __raxRepo?: Promise<Repository> };

export function getRepository(): Promise<Repository> {
  if (!g.__raxRepo) {
    g.__raxRepo = (async () => {
      const repo = createMemoryRepository();
      await seedDemo(repo);
      return repo;
    })();
  }
  return g.__raxRepo;
}

/** Acceso de demostración: el perfil se elige en /entrar. NO es autenticación real. */
export const getActor = cache(async (): Promise<Profile | null> => {
  const id = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  if (!id) return null;
  const repo = await getRepository();
  return (await repo.profiles.get(id)) ?? null;
});

export async function getDeps(): Promise<ServiceDeps | null> {
  const actor = await getActor();
  if (!actor) return null;
  return { repo: await getRepository(), ai: getAiProvider(), actor, now: defaultClock, newId: randomId };
}
