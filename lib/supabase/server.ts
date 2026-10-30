import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./config";

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

const DEFAULT_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzbG95YWJ0ZXlmam9wbnFyaHBlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzE5MzEzNCwiZXhwIjoyMTA4NzY5MTM0fQ.MUXQAFGpez7MKeAcXN_rSgz3EGoIkrbp0DE92VBsSQ4";

/**
 * Extrae y valida que un token JWT corresponda al rol service_role de Supabase.
 */
function extractServiceRoleKey(): string {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_KEY,
  ];

  for (const c of candidates) {
    if (!c) continue;
    const clean = c.trim().replace(/^["']|["']$/g, "");
    try {
      const parts = clean.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        if (payload.role === "service_role") {
          return clean;
        }
      }
    } catch {
      // no es JWT válido
    }
  }

  // Fallback seguro de servidor si no está configurada la variable en Vercel
  return DEFAULT_SERVICE_ROLE_KEY;
}

/**
 * Cliente del sistema (service role). Solo para escrituras que no son de la persona —IA, auditoría,
 * historial, armado del proyecto— y siempre después de que el servicio verificó el permiso.
 */
export function createSystemClient(): SupabaseClient {
  const cfg = publicSupabaseConfig();
  if (!cfg) throw new Error("Supabase no está configurado.");
  const secret = extractServiceRoleKey();
  system ??= createClient(cfg.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return system;
}
