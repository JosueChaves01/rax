import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/supabase/config";

function resolveOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const fallback = appUrl();
  if (process.env.NODE_ENV !== "development" && fallback && !fallback.includes("localhost")) {
    return fallback;
  }
  return request.nextUrl.origin;
}

/** Destino del enlace de confirmación de correo y del regreso desde Google: canjea el código por una sesión. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const target = next && (next.startsWith("/bienvenida") || next.startsWith("/app")) ? next : "/bienvenida";
  const origin = resolveOrigin(request);

  if (code) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, origin));
  }
  // Google devuelve ?error=... si la persona cancela o el proveedor no está configurado.
  const fromProvider = request.nextUrl.searchParams.has("error") && !code;
  return NextResponse.redirect(new URL(`/entrar?error=${fromProvider ? "google" : "enlace"}`, origin));
}
