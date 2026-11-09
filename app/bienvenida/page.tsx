import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor, homeFor } from "@/lib/runtime";
import { isB2BFlow } from "@/lib/flags";
import { signOutAction } from "@/app/actions";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Bienvenida · RAX" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ repostular?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  // Un mentor rechazado vuelve acá para mandar una solicitud nueva.
  const b2b = isB2BFlow();
  // Flujo B2B (sin administración): quien había pedido ser mentor y quedó esperando se activa aquí.
  const activating = b2b && actor.onboarding?.intent === "mentor" && actor.role !== "mentor";
  const reapply = !b2b && (await searchParams).repostular === "1" && actor.role !== "mentor" && actor.mentorStatus === "rejected";
  if (!reapply && !activating && homeFor(actor) !== "/bienvenida") redirect(homeFor(actor));
  const mode = b2b
    ? actor.role === "mentor" || activating
      ? "mentor"
      : "choose"
    : reapply
      ? "mentor"
      : actor.role === "admin"
        ? "admin"
        : actor.role === "mentor"
          ? "mentor"
          : "choose";
  return (
    <main className="ambient min-h-dvh px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <Link href="/" className="display text-2xl">
            <span className="text-accent">R</span>AX
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink">
              Salir
            </button>
          </form>
        </div>
        <OnboardingForm mode={mode} defaultName={actor.name} reapply={reapply} b2b={b2b} />
      </div>
    </main>
  );
}
