/**
 * Resuelve la clave secreta de Supabase (solo servidor) desde las variables de entorno.
 * Acepta la clave nueva (`sb_secret_…`) o la heredada `service_role` (JWT). Rechaza claves
 * públicas (`sb_publishable_…` o un JWT `anon`) para no crear un "cliente del sistema" sin permisos.
 * Nunca hay una clave de respaldo en el código: si falta, se lanza un error claro.
 */
const ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_KEY",
] as const;

export class MissingSupabaseSecretError extends Error {
  constructor(detail: string) {
    super(
      `Falta la clave secreta de Supabase (${detail}). Configura SUPABASE_SECRET_KEY (sb_secret_…) ` +
        "o SUPABASE_SERVICE_ROLE_KEY en el servidor (Vercel → Settings → Environment Variables).",
    );
    this.name = "MissingSupabaseSecretError";
  }
}

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function isSecretKey(value: string): boolean {
  if (value.startsWith("sb_secret_")) return true;
  return jwtRole(value) === "service_role";
}

export function resolveSupabaseSecretKey(env: Record<string, string | undefined> = process.env): string {
  let sawPublicKey = false;
  for (const name of ENV_NAMES) {
    const raw = env[name];
    if (!raw) continue;
    const clean = raw.trim().replace(/^["']|["']$/g, "");
    if (!clean) continue;
    if (isSecretKey(clean)) return clean;
    sawPublicKey = true;
  }
  throw new MissingSupabaseSecretError(
    sawPublicKey ? "la variable configurada no es una clave secreta: parece una clave pública" : "no está configurada",
  );
}
