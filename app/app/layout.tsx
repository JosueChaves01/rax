import { redirect } from "next/navigation";
import { getActor, getDeps, homeFor } from "@/lib/runtime";
import { loadMyWorkspaces, pendingFor } from "@/lib/services/pending";
import { AppShell } from "@/shared/ui/app-shell";
import type { NotificationItem } from "@/shared/ui/notification-drawer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  if (homeFor(actor) === "/bienvenida") redirect("/bienvenida");

  const d = await getDeps();
  let notifications: NotificationItem[] = [];

  if (d && actor.role !== "admin") {
    try {
      const workspaces = await loadMyWorkspaces(d);
      notifications = pendingFor(actor.role, actor.id, workspaces).map((p) => ({
        id: p.id,
        title: p.title,
        detail: p.detail,
        timeAgo: p.meta,
        kind: p.kind,
        href: p.href,
      }));
    } catch (e) {
      // Los pendientes son una ayuda: si fallan, la app sigue.
      console.error("[rax] no se pudieron calcular los pendientes:", e instanceof Error ? e.message : e);
    }
  }

  return (
    <AppShell actor={actor} notifications={notifications}>
      {children}
    </AppShell>
  );
}
