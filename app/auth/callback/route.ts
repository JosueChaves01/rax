import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/** Destino del enlace de confirmación de correo: canjea el código por una sesión. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const target = next && (next.startsWith("/bienvenida") || next.startsWith("/app")) ? next : "/bienvenida";
  if (code) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, url.origin));
  }
  return NextResponse.redirect(new URL("/entrar?error=enlace", url.origin));
}
