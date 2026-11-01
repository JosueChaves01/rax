import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { ReportsView, type ReportMetricsData } from "@/shared/ui/reports-view";

export const metadata = { title: "Métricas y Reportes · RAX" };
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIT_WINDOW_DAYS = 30;
const BUCKET_COUNT = 5;

export default async function ReportsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  // Alcance: los reportes son de administración; emprendedor y mentor leen su avance en cada proyecto.
  if (d.actor.role !== "admin") redirect("/app");

  const [tasks, audits, sessions, evaluations, interventions] = await Promise.all([
    d.repo.tasks.list().catch(() => []),
    d.repo.auditEvents.list().catch(() => []),
    d.repo.mentorSessions.list().catch(() => []),
    d.repo.cycleEvaluations.list().catch(() => []),
    d.repo.mentorInterventions.list().catch(() => []),
  ]);

  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const totalTasks = tasks.length;
  const completionRate = totalTasks > 0 ? `${Math.round((doneTasks / totalTasks) * 100)}%` : "—";
  const aiInvocations = audits.filter((event) => event.action === "ai.invoked").length;
  const errorEvents = audits.filter((event) => event.action === "ai.failed" || event.action === "access.denied").length;

  const now = Date.now();
  const bucketSize = (AUDIT_WINDOW_DAYS * DAY_MS) / BUCKET_COUNT;
  const windowStart = now - AUDIT_WINDOW_DAYS * DAY_MS;
  const buckets = Array.from({ length: BUCKET_COUNT }, (_, index) => {
    const start = windowStart + index * bucketSize;
    return { start, end: index === BUCKET_COUNT - 1 ? now + 1 : start + bucketSize };
  });

  const timelineLabels = buckets.map(({ start }) =>
    new Intl.DateTimeFormat("es-CR", {
      day: "2-digit",
      month: "short",
      timeZone: "America/Costa_Rica",
    }).format(new Date(start)),
  );
  const countBetween = (timestamp: string, start: number, end: number) => {
    const value = Date.parse(timestamp);
    return Number.isFinite(value) && value >= start && value < end;
  };

  const timeline = {
    labels: timelineLabels,
    resources: buckets.map(({ start, end }) =>
      audits.filter(
        (event) =>
          (event.action === "resource.created" || event.action === "resource.updated") &&
          countBetween(event.createdAt, start, end),
      ).length,
    ),
    tasks: buckets.map(({ start, end }) =>
      tasks.filter((task) => countBetween(task.createdAt, start, end)).length,
    ),
    aiInvocations: buckets.map(({ start, end }) =>
      audits.filter((event) => event.action === "ai.invoked" && countBetween(event.createdAt, start, end)).length,
    ),
    evaluations: buckets.map(({ start, end }) =>
      evaluations.filter((evaluation) => countBetween(evaluation.evaluatedAt, start, end)).length,
    ),
  };

  const initialData: ReportMetricsData = {
    responseTime: {
      value: "—",
      detail: "No hay mediciones de latencia guardadas.",
    },
    completionRate: {
      value: completionRate,
      detail: totalTasks > 0 ? `${doneTasks} de ${totalTasks} tareas completadas` : "Sin tareas registradas.",
    },
    aiInvocations: {
      value: aiInvocations > 0 ? String(aiInvocations) : "—",
      detail: aiInvocations > 0 ? "Invocaciones registradas en auditoría" : "Sin invocaciones de IA registradas.",
    },
    satisfaction: {
      value: "—",
      detail: "No se recopilan encuestas de satisfacción.",
    },
    timeline,
    tabBreakdowns: {
      mentor: {
        sessionsCount: sessions.length,
        activeProjects: new Set(sessions.map((session) => session.projectId)).size,
        interventionsCount: interventions.length,
      },
      entrepreneur: {
        completedTasks: doneTasks,
        totalTasks,
        aiInvocations,
      },
      operations: {
        totalAudits: audits.length,
        aiInvocations,
        errorEvents,
      },
    },
  };

  return <ReportsView initialData={initialData} />;
}
