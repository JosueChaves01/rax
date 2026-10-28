import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getActor, homeFor } from "@/lib/runtime";
import { missingConfig } from "@/lib/supabase/config";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Entrar · RAX" };

export default async function EnterPage({ searchParams }: { searchParams: Promise<{ next?: string; modo?: string; error?: string }> }) {
  await connection();
  if (missingConfig().length) redirect("/configuracion");
  const actor = await getActor();
  if (actor) redirect(homeFor(actor));
  const { next, modo, error } = await searchParams;
  return (
    <main className="ambient min-h-dvh px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-md">
        <Link href="/" className="display text-2xl">
          <span className="text-accent">R</span>AX
        </Link>
        <h1 className="display mt-10 text-[clamp(2.75rem,10vw,4.5rem)]">
          {modo === "registro" ? (
            <>
              Empecemos <span className="text-highlight">en orden.</span>
            </>
          ) : (
            <>
              Volvé a <span className="text-highlight">tu proyecto.</span>
            </>
          )}
        </h1>
        <p className="mt-4 text-muted">
          Una sola cuenta para emprender o para acompañar como mentor. Después te preguntamos cómo vas a usar RAX.
        </p>
        <AuthForm initialMode={modo === "registro" ? "signup" : "signin"} next={next} linkError={
            error === "enlace"
              ? "El enlace no es válido o ya venció. Entrá con tu correo y contraseña."
              : error === "google"
                ? "No se completó el ingreso con Google. Probá de nuevo o usá tu correo."
                : undefined
          } />
      </div>
    </main>
  );
}
