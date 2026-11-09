import { redirect } from "next/navigation";
import { getActor, getDeps, homeFor } from "@/lib/runtime";
import { isB2BFlow } from "@/lib/flags";
import { loadMyWorkspaces, pendingFor } from "@/lib/services/pending";
import { AppShell } from "@/shared/ui/app-shell";
import type { NotificationItem } from "@/shared/ui/notification-drawer";
import { loadPanelNotifications } from "./panel-notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  if (homeFor(actor) === "/bienvenida") redirect("/bienvenida");

  const d = await getDeps();
  const b2b = isB2BFlow();
  let notifications: NotificationItem[] = [];

  if (d && actor.role !== "admin") {
    try {
      const workspaces = await loadMyWorkspaces(d);
      // Flujo B2B: los proyectos del mentor (mentor_id) no usan los pendientes del flujo viejo.
      const legacy = b2b ? workspaces.filter((w) => !w.project.mentorId) : workspaces;
      notifications = pendingFor(actor.role, actor.id, legacy).map((p) => ({
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
    if (b2b) notifications = [...(await loadPanelNotifications(d)), ...notifications];
  }

  return (
    <AppShell actor={actor} notifications={notifications} b2b={b2b}>
      {children}
    </AppShell>
  );
}
