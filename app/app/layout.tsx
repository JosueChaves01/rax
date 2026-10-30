import { redirect } from "next/navigation";
import { getActor, getDeps, homeFor } from "@/lib/runtime";
import { AppShell } from "@/shared/ui/app-shell";
import type { NotificationItem } from "@/shared/ui/notification-drawer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/entrar");
  if (homeFor(actor) === "/bienvenida") redirect("/bienvenida");

  const d = await getDeps();
  const notifications: NotificationItem[] = [];

  if (d) {
    try {
      const [tasks, sessions, audits] = await Promise.all([
        d.repo.tasks.list().catch(() => []),
        d.repo.mentorSessions.list().catch(() => []),
        d.repo.auditEvents.list().catch(() => []),
      ]);

      // 1. Tareas urgentes o activas
      const urgentTasks = tasks.filter((t) => t.status === "todo" || t.status === "doing");
      if (urgentTasks.length > 0) {
        const t = urgentTasks[0];
        notifications.push({
          id: `notif-task-${t.id}`,
          title: "Recordatorio de tarea",
          detail: `«${t.title}» requiere tu atención.`,
          timeAgo: "Activa",
          kind: "task",
          href: "/app/tareas",
        });
      }

      // 2. Sesiones de mentoría
      if (sessions.length > 0) {
        const s = sessions[0];
        notifications.push({
          id: `notif-sess-${s.id}`,
          title: "Sesión programada",
          detail: `Sesión de mentoría registrada (${s.kind}).`,
          timeAgo: "Próxima",
          kind: "session",
          href: "/app/sesiones",
        });
      }

      // 3. Actividad de IA y Evaluaciones
      const aiAudits = audits.filter((a) => a.action.startsWith("ai.")).slice(-2);
      for (const a of aiAudits) {
        notifications.push({
          id: `notif-ai-${a.id}`,
          title: a.action === "ai.proposal_applied" ? "Revisión de IA completada" : "Sugerencia de IA",
          detail: a.meta && typeof a.meta === "object" && "task" in a.meta
            ? `Acción de copiloto procesada (${String(a.meta.task)}).`
            : "Revisa las propuestas generadas por el sistema.",
          timeAgo: "Reciente",
          kind: a.action === "ai.proposal_applied" ? "review" : "ai",
          href: a.action === "ai.proposal_applied" ? "/app/aprendizaje" : "/app/sugerencias",
        });
      }

      // 4. Material de aprendizaje
      notifications.push({
        id: "notif-mat-std",
        title: "Nuevo material asignado",
        detail: "Tienes disponible la guía de formulación y ejercicios PREP.",
        timeAgo: "Disponible",
        kind: "material",
        href: "/app/aprendizaje",
      });
    } catch {
      // Silencioso ante fallos transitorios en SSR
    }
  }

  return (
    <AppShell actor={actor} notifications={notifications}>
      {children}
    </AppShell>
  );
}
