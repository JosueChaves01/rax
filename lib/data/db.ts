import { conflict, forbidden, notFound, validation } from "@/lib/errors";

export type Row = Record<string, unknown>;

/**
 * Acceso mínimo a una base Postgres con nombres de columna (snake_case). Dos implementaciones:
 * supabase-js en la app (lib/data/supabase-db.ts) y `pg` en las pruebas, que así ejercitan
 * las mismas políticas RLS y triggers que producción.
 */
export interface Db {
  select(table: string, match: Row): Promise<Row[]>;
  insert(table: string, row: Row): Promise<Row>;
  /** Devuelve las filas actualizadas; [] si ninguna coincidió o RLS no lo permitió. */
  update(table: string, match: Row, patch: Row): Promise<Row[]>;
  /** Las `limit` filas más nuevas según `orderColumn` (descendente). Opcional: sin esto se filtra en memoria. */
  selectLatest?(table: string, match: Row, orderColumn: string, limit: number): Promise<Row[]>;
  /** Cuántas filas coinciden, sin traerlas. Opcional: sin esto se cuentan en memoria. */
  count?(table: string, match: Row): Promise<number>;
  /** Llama a una función SQL expuesta (RPC). Opcional: sin esto las funciones del repositorio no existen. */
  rpc?(fn: string, args: Row): Promise<unknown>;
}

/** Traduce errores de Postgres a errores de dominio sin exponer detalles internos. */
export function fromPgError(code: string | undefined, message: string): Error {
  switch (code) {
    case "42501": // privilegio insuficiente, RLS o nuestros triggers de guarda
      console.error(`[db] 42501 insufficient_privilege: ${message}`);
      return forbidden();
    case "23505":
      return conflict("Ya existe un registro igual.");
    case "23503":
      return notFound();
    case "23514":
    case "22P02":
    case "23502":
      return validation("Los datos no cumplen las reglas de RAX.");
    case "PGRST116":
      return notFound();
    default:
      return new Error(`Error de base de datos (${code ?? "desconocido"}): ${message}`);
  }
}
