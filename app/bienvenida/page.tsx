import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor, homeFor } from "@/lib/runtime";
import { signOutAction } from "@/app/actions";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Bienvenida · RAX" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ repostular?: string }> }) {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  // Un mentor rechazado vuelve acá para mandar una solicitud nueva.
  const reapply = (await searchParams).repostular === "1" && actor.role !== "mentor" && actor.mentorStatus === "rejected";
  if (!reapply && homeFor(actor) !== "/bienvenida") redirect(homeFor(actor));
  const mode = reapply ? "mentor" : actor.role === "admin" ? "admin" : actor.role === "mentor" ? "mentor" : "choose";
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
        <OnboardingForm mode={mode} defaultName={actor.name} reapply={reapply} />
      </div>
    </main>
  );
}
