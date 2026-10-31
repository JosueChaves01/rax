import pg from "pg";
import { fromPgError, type Db, type Row } from "@/lib/data/db";

// Fechas `date` como texto (no Date local) y bigint como texto: igual que PostgREST.
pg.types.setTypeParser(1082, (v) => v);

/**
 * Db de pruebas sobre `pg`. Cada operación corre en una transacción con el rol y el `sub` del JWT
 * que tendría en Supabase: `authenticated` + id de la persona, o `service_role` para el sistema.
 */
export function pgDb(pool: pg.Pool, uid: string | null): Db {
  // Columnas jsonb: ahí van como JSON también las listas (vacías o no), como haría PostgREST.
  const jsonbCols = loadJsonbColumns(pool);
  const encode = async (table: string, row: Row) => {
    const cols = await jsonbCols;
    return Object.entries(row).map(([c, v]) => (cols.has(`${table}.${c}`) && v !== null && v !== undefined ? JSON.stringify(v) : jsonable(v)));
  };
  async function run(sql: string, params: unknown[]): Promise<Row[]> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
        uid ? "authenticated" : "service_role",
        uid ?? "",
      ]);
      const res = await client.query(sql, params);
      await client.query("commit");
      return res.rows;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      const err = e as { code?: string; message: string };
      if (process.env.RAX_DEBUG_PG) console.error("[pg]", err.code, err.message);
      throw fromPgError(err.code, err.message);
    } finally {
      client.release();
    }
  }

  const where = (match: Row, offset: number, params: unknown[]) => {
    const parts = Object.entries(match).map(([k, v]) => {
      if (v === null) return `"${k}" is null`;
      params.push(v);
      return `"${k}" = $${offset + params.length}`;
    });
    return parts.length ? ` where ${parts.join(" and ")}` : "";
  };

  return {
    async select(table, match) {
      const params: unknown[] = [];
      return run(`select * from public."${table}"${where(match, 0, params)}`, params);
    },
    async insert(table, row) {
      const cols = Object.keys(row);
      const params = await encode(table, row);
      const rows = await run(
        `insert into public."${table}" (${cols.map((c) => `"${c}"`).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
        params,
      );
      return rows[0];
    },
    async update(table, match, patch) {
      const cols = Object.keys(patch);
      const params: unknown[] = await encode(table, patch);
      const set = cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
      const extra: unknown[] = [];
      const w = where(match, params.length, extra);
      return run(`update public."${table}" set ${set}${w} returning *`, [...params, ...extra]);
    },
  };
}

/** node-pg envía arreglos como arreglos de Postgres; los objetos (jsonb) van como JSON. */
const jsonable = (v: unknown) => (v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);

const jsonbCache = new WeakMap<pg.Pool, Promise<Set<string>>>();
function loadJsonbColumns(pool: pg.Pool): Promise<Set<string>> {
  let p = jsonbCache.get(pool);
  if (!p) {
    p = pool
      .query("select table_name, column_name from information_schema.columns where table_schema = 'public' and data_type = 'jsonb'")
      .then((r) => new Set(r.rows.map((x: { table_name: string; column_name: string }) => `${x.table_name}.${x.column_name}`)));
    jsonbCache.set(pool, p);
  }
  return p;
}
