import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Profile } from "@/types/domain";
import type { Repository } from "@/lib/data/repository";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { createPgRepository } from "@/lib/data/supabase-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import type { AiProvider } from "@/lib/ai/provider";
import type { ServiceDeps } from "@/lib/services/base";
import { pgDb } from "./pg-db";

export const PEOPLE: Profile[] = [
  { id: "ent1", name: "Emprendedora Uno", email: "e1@test", role: "entrepreneur", mentorStatus: "none", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ent2", name: "Emprendedor Dos", email: "e2@test", role: "entrepreneur", mentorStatus: "none", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "men1", name: "Mentora Asignada", email: "m1@test", role: "mentor", mentorStatus: "approved", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "men2", name: "Mentor Ajeno", email: "m2@test", role: "mentor", mentorStatus: "approved", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "adm", name: "Admin", email: "a@test", role: "admin", mentorStatus: "none", createdAt: "2026-01-01T00:00:00.000Z" },
];

/**
 * Backend de las pruebas: "memory" (por defecto) o "pg" (RAX_TEST_BACKEND=pg), que corre los mismos
 * escenarios contra Postgres con las migraciones, RLS y triggers de Supabase (ver tests/pg-setup.ts).
 */
export const BACKEND = process.env.RAX_TEST_BACKEND === "pg" ? "pg" : "memory";

export interface World {
  /** Vista sin restricciones para inspeccionar el estado (en pg: service role). */
  repo: Repository;
  as: (name: string, provider?: AiProvider) => ServiceDeps;
  /** Id real de una persona de PEOPLE (en pg son uuid). */
  id: (name: string) => string;
  /** Alta de una persona nueva, sin onboarding (como al registrarse). */
  signUp: (key: string, name: string) => Promise<void>;
  /** Relee el perfil (p. ej. después del onboarding o de una aprobación). */
  reload: (key: string) => Promise<void>;
}

export async function world(ai: AiProvider = new SimulatedProvider()): Promise<World> {
  let t = Date.parse("2026-10-01T00:00:00.000Z");
  const now = () => new Date((t += 1000)).toISOString();
  return BACKEND === "pg" ? pgWorld(ai, now) : memoryWorld(ai, now);
}

async function memoryWorld(ai: AiProvider, now: () => string): Promise<World> {
  const repo = createMemoryRepository();
  const people = new Map<string, Profile>();
  for (const p of PEOPLE) people.set(p.id, await repo.profiles.insert({ ...p, onboardedAt: p.createdAt }));
  let n = 0;
  const newId = (prefix: string) => `${prefix}_${++n}`;
  const as = (name: string, provider: AiProvider = ai): ServiceDeps => ({ repo, ai: provider, actor: people.get(name)!, now, newId });
  return {
    repo,
    as,
    id: (name) => name,
    signUp: async (key, name) => {
      people.set(key, await repo.profiles.insert({ id: key, name, email: `${key}@test`, role: "entrepreneur", mentorStatus: "none", createdAt: now() }));
    },
    reload: async (key) => {
      people.set(key, (await repo.profiles.get(key))!);
    },
  };
}

let dbCounter = 0;
const pools: Array<{ pool: pg.Pool; dbName: string }> = [];

async function pgWorld(ai: AiProvider, now: () => string): Promise<World> {
  const base = process.env.RAX_TEST_PG!;
  const dbName = `rax_w_${process.pid}_${++dbCounter}`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`create database ${dbName} template rax_tpl`);
  await admin.end();
  const url = new URL(base);
  url.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  pools.push({ pool, dbName });

  // Personas: se crean como en Supabase (auth.users → trigger → profiles) y la administración ajusta roles.
  const ids = new Map(PEOPLE.map((p) => [p.id, randomUUID()]));
  for (const p of PEOPLE) {
    await pool.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [ids.get(p.id), p.email, { name: p.name }]);
    await pool.query("update public.profiles set role = $2, mentor_status = $3, onboarded_at = now() where id = $1", [ids.get(p.id), p.role, p.mentorStatus]);
  }
  const sys = createPgRepository(pgDb(pool, null));
  const profiles = new Map<string, Profile>();
  for (const p of PEOPLE) profiles.set(p.id, (await sys.profiles.get(ids.get(p.id)!))!);
  const as = (name: string, provider: AiProvider = ai): ServiceDeps => {
    const actor = profiles.get(name)!;
    return { repo: createPgRepository(pgDb(pool, actor.id)), sys, ai: provider, actor, now, newId: () => randomUUID() };
  };
  return {
    repo: sys,
    as,
    id: (name) => ids.get(name)!,
    signUp: async (key, name) => {
      ids.set(key, randomUUID());
      await pool.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [ids.get(key), `${key}@test`, { name }]);
      profiles.set(key, (await sys.profiles.get(ids.get(key)!))!);
    },
    reload: async (key) => {
      profiles.set(key, (await sys.profiles.get(ids.get(key)!))!);
    },
  };
}

/** Cierra conexiones y borra las bases de cada mundo (afterAll en pruebas pg). */
export async function closeWorlds() {
  const base = process.env.RAX_TEST_PG;
  for (const { pool } of pools) await pool.end();
  if (!base || !pools.length) return;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  for (const { dbName } of pools.splice(0)) await admin.query(`drop database if exists ${dbName}`);
  await admin.end();
}

/** Responde la guía de entrevista con mensajes dados, en orden. */
export const INTERVIEW = [
  "Estoy explorando una idea de lavandería por suscripción para estudiantes.",
  "Le pregunté a 5 compañeros de residencia si la usarían.",
  "La usarían estudiantes que viven solos. Pagarían ellos o sus padres, no estoy seguro.",
  "Vi que en mi residencia nadie tiene lavadora y pierden la tarde en la lavandería.",
  "Pierden tiempo y gastan en lavanderías caras. Quisiera que fuera más simple.",
];
