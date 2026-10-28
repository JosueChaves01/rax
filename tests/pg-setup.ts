import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * globalSetup del modo pg: arma la base plantilla `rax_tpl` (stubs de Supabase + migraciones)
 * de la que cada mundo de prueba clona una base nueva.
 */
export default async function setup() {
  if (process.env.RAX_TEST_BACKEND !== "pg") return;
  const base = process.env.RAX_TEST_PG;
  if (!base) throw new Error("RAX_TEST_PG no está definido (p. ej. postgres://postgres@localhost:5432/postgres).");
  const root = path.resolve(__dirname, "..");
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query("drop database if exists rax_tpl");
  await admin.query("create database rax_tpl");
  await admin.end();

  const url = new URL(base);
  url.pathname = "/rax_tpl";
  const tpl = new pg.Client({ connectionString: url.toString() });
  await tpl.connect();
  await tpl.query(readFileSync(path.join(root, "supabase/tests/00_local_stubs.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await tpl.query(readFileSync(path.join(dir, f), "utf8"));
  }
  await tpl.end();
}
