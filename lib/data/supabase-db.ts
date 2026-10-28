import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromPgError, type Db, type Row } from "./db";

/** Implementación de Db sobre supabase-js (PostgREST). Con el cliente de la persona, aplica RLS. */
export function supabaseDb(client: SupabaseClient): Db {
  const fail = (e: { code?: string; message: string }) => {
    throw fromPgError(e.code, e.message);
  };
  return {
    async select(table, match) {
      let q = client.from(table).select("*");
      for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v as string);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []) as Row[];
    },
    async insert(table, row) {
      const { data, error } = await client.from(table).insert(row).select("*").single();
      if (error) fail(error);
      return data as Row;
    },
    async update(table, match, patch) {
      let q = client.from(table).update(patch);
      for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v as string);
      const { data, error } = await q.select("*");
      if (error) fail(error);
      return (data ?? []) as Row[];
    },
  };
}
