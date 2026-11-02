import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MissingSupabaseSecretError, resolveSupabaseSecretKey } from "@/lib/supabase/secret-key";

const jwt = (role: string) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ role })).toString("base64url"), "firma"].join(".");

describe("resolveSupabaseSecretKey", () => {
  it("acepta la clave nueva sb_secret_", () => {
    expect(resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: "sb_secret_abc" })).toBe("sb_secret_abc");
  });

  it("acepta un JWT service_role heredado y limpia comillas", () => {
    const key = jwt("service_role");
    expect(resolveSupabaseSecretKey({ SUPABASE_SERVICE_ROLE_KEY: ` "${key}" ` })).toBe(key);
  });

  it("salta una clave pública y usa la secreta siguiente", () => {
    const key = jwt("service_role");
    expect(resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: jwt("anon"), SUPABASE_SERVICE_ROLE_KEY: key })).toBe(key);
  });

  it("falla con un error claro si no hay clave", () => {
    expect(() => resolveSupabaseSecretKey({})).toThrow(MissingSupabaseSecretError);
    expect(() => resolveSupabaseSecretKey({})).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("falla si solo hay claves públicas", () => {
    expect(() => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: "sb_publishable_x" })).toThrow(/clave pública/);
    expect(() => resolveSupabaseSecretKey({ SUPABASE_KEY: jwt("anon") })).toThrow(MissingSupabaseSecretError);
  });

  it("el código no trae ninguna clave de Supabase escrita", () => {
    for (const f of ["lib/supabase/server.ts", "lib/supabase/secret-key.ts", "lib/supabase/config.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.eyJ/);
      expect(src).not.toMatch(/sb_secret_[A-Za-z0-9]{8,}/);
    }
  });
});
