import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./config";
import { resolveSupabaseSecretKey } from "./secret-key";

/** Cliente con la sesión de la persona (cookies): todo lo que hace pasa por RLS. */
export async function createUserClient(): Promise<SupabaseClient> {
  const cfg = publicSupabaseConfig();
  if (!cfg) throw new Error("Supabase no está configurado.");
  const store = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // En un Server Component no se pueden escribir cookies; el middleware renueva la sesión.
        }
      },
    },
  });
}

let system: SupabaseClient | null = null;

/**
 * Cliente del sistema (service role). Solo para escrituras que no son de la persona —IA, auditoría,
 * historial, armado del proyecto— y siempre después de que el servicio verificó el permiso.
 */
export function createSystemClient(): SupabaseClient {
  const cfg = publicSupabaseConfig();
  if (!cfg) throw new Error("Supabase no está configurado.");
  const secret = resolveSupabaseSecretKey();
  system ??= createClient(cfg.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return system;
}
