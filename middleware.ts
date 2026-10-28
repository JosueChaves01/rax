import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "@/lib/supabase/config";

/**
 * Renueva la sesión de Supabase en cada pedido y protege las rutas privadas.
 * La autorización real está en los servicios y en RLS; esto solo evita mostrar pantallas sin sesión.
 */
export async function middleware(request: NextRequest) {
  const cfg = publicSupabaseConfig();
  const path = request.nextUrl.pathname;
  const isPrivate = path.startsWith("/app") || path.startsWith("/bienvenida");
  if (!cfg) {
    const to = request.nextUrl.clone();
    to.pathname = "/configuracion";
    return isPrivate ? NextResponse.redirect(to) : NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) request.cookies.set(c.name, c.value);
        response = NextResponse.next({ request });
        for (const c of list) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPrivate && !user) {
    const to = request.nextUrl.clone();
    to.pathname = "/entrar";
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
