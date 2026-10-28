import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/runtime";
import { ROLE_LABEL } from "@/features/labels";
import { leaveDemo } from "@/app/actions";
import { DemoTag } from "@/shared/ui/primitives";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  return (
    <div className="min-h-dvh">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-highlight focus:px-3 focus:py-2 focus:text-black">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
          <Link href={actor.role === "admin" ? "/app/admin" : "/app"} className="display text-xl" aria-label="RAX, mis proyectos">
            <span className="text-accent">R</span>AX
          </Link>
          <nav aria-label="Principal" className="flex gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em]">
            {actor.role === "admin" ? (
              <Link href="/app/admin" className="rounded-full px-3 py-1.5 text-muted hover:bg-white/5 hover:text-ink">Administración</Link>
            ) : (
              <Link href="/app" className="rounded-full px-3 py-1.5 text-muted hover:bg-white/5 hover:text-ink">
                {actor.role === "mentor" ? "Proyectos asignados" : "Mis proyectos"}
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{actor.name}</p>
              <p className="text-[0.6875rem] text-muted">{ROLE_LABEL[actor.role]}</p>
            </div>
            <DemoTag />
            <form action={leaveDemo}>
              <button type="submit" className="rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted hover:bg-white/5 hover:text-ink">
                Cambiar
              </button>
            </form>
          </div>
        </div>
      </header>
      <div id="contenido">{children}</div>
    </div>
  );
}
