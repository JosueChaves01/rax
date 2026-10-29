import { redirect } from "next/navigation";
import { getActor, homeFor } from "@/lib/runtime";
import { AppShell } from "@/shared/ui/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  if (homeFor(actor) === "/bienvenida") redirect("/bienvenida");

  return (
    <AppShell actor={actor}>
      {children}
    </AppShell>
  );
}
