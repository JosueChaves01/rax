import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { checkN8nHealthLive } from "@/lib/n8n/dispatcher";
import { ReportsView, type ReportMetricsData } from "@/shared/ui/reports-view";

export const metadata = { title: "Métricas y Reportes · RAX" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const [tasks, audits, sessions, evaluations, interventions, health] = await Promise.all([
    d.repo.tasks.list().catch(() => []),
    d.repo.auditEvents.list().catch(() => []),
    d.repo.mentorSessions.list().catch(() => []),
    d.repo.cycleEvaluations.list().catch(() => []),
    d.repo.mentorInterventions.list().catch(() => []),
    checkN8nHealthLive().catch(() => ({ ok: false, status: 503, latencyMs: 0, message: "offline" })),
  ]);

  // 1. Cálculo de Métricas Reales
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const totalTasks = tasks.length;
  const completionRateVal = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const aiAudits = audits.filter(
    (a) => a.action.startsWith("ai.") || a.action.includes("proposal") || a.action.includes("document")
  ).length;
  const totalAudits = audits.length;
  const aiAdoptionVal = totalAudits > 0 ? Math.round((aiAudits / totalAudits) * 100) : 0;

  const measuredLatency = health.latencyMs > 0 ? `${(health.latencyMs / 1000).toFixed(1)}s` : health.ok ? "<0.1s" : "—";
  const errorAudits = audits.filter((a) => a.action.includes("failed") || a.action.includes("denied")).length;
  const errorRateStr = totalAudits > 0 ? `${((errorAudits / totalAudits) * 100).toFixed(1)}%` : "0.0%";

  // 2. Generación dinámica de 5 puntos temporales para el gráfico basados en eventos reales
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const bucketWindows = [
    { start: now - 28 * dayMs, end: now - 21 * dayMs },
    { start: now - 21 * dayMs, end: now - 14 * dayMs },
    { start: now - 14 * dayMs, end: now - 7 * dayMs },
    { start: now - 7 * dayMs, end: now - 2 * dayMs },
    { start: now - 2 * dayMs, end: now + dayMs },
  ];

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const timelineLabels = bucketWindows.map((w) => {
    const dt = new Date(w.start);
    return `${dt.getDate()} ${monthNames[dt.getMonth()]}`;
  });

  const timelineDocuments = bucketWindows.map((w) => {
    const count = audits.filter(
      (a) =>
        new Date(a.createdAt).getTime() >= w.start &&
        new Date(a.createdAt).getTime() < w.end &&
        (a.action.includes("resource") || a.action.includes("document"))
    ).length;
    return count > 0 ? Math.min(100, count * 20) : 0;
  });

  const timelineTasks = bucketWindows.map((w) => {
    const count = tasks.filter(
      (t) => new Date(t.createdAt).getTime() >= w.start && new Date(t.createdAt).getTime() < w.end
    ).length;
    return count > 0 ? Math.min(100, count * 20) : 0;
  });

  const timelineChat = bucketWindows.map((w) => {
    const count = audits.filter(
      (a) =>
        new Date(a.createdAt).getTime() >= w.start &&
        new Date(a.createdAt).getTime() < w.end &&
        (a.action.includes("chat") || a.action === "ai.invoked")
    ).length;
    return count > 0 ? Math.min(100, count * 20) : 0;
  });

  const timelineEvaluations = bucketWindows.map((w) => {
    const count = evaluations.filter(
      (e) => new Date(e.evaluatedAt).getTime() >= w.start && new Date(e.evaluatedAt).getTime() < w.end
    ).length;
    return count > 0 ? Math.min(100, count * 25) : 0;
  });

  const ratingMap: Record<string, number> = { nascent: 3.5, developing: 4.2, autonomous: 5.0 };
  let totalRating = 0;
  for (const e of evaluations) {
    totalRating += (e.autonomyAssessment?.rating && ratingMap[e.autonomyAssessment.rating]) || 4.5;
  }
  const avgSatisfaction =
    evaluations.length > 0 ? (totalRating / evaluations.length).toFixed(1) : null;

  const initialData: ReportMetricsData = {
    responseTime: {
      value: measuredLatency,
      change: "—",
      detail: health.ok ? "túnel n8n activo" : "procesamiento local",
    },
    completionRate: {
      value: `${completionRateVal}%`,
      change: "—",
      detail: `${doneTasks} de ${totalTasks} tareas resueltas`,
    },
    aiAdoption: {
      value: `${aiAdoptionVal}%`,
      change: "—",
      detail: `${aiAudits} eventos de copiloto registrados`,
    },
    satisfaction: {
      value: avgSatisfaction ? `${avgSatisfaction}/5` : "—",
      change: "—",
      detail: evaluations.length > 0 ? `${evaluations.length} evaluaciones de ciclo` : "Sin evaluaciones aún",
    },
    timeline: {
      labels: timelineLabels,
      documents: timelineDocuments,
      tasks: timelineTasks,
      chat: timelineChat,
      evaluations: timelineEvaluations,
    },
    tabBreakdowns: {
      mentor: {
        sessionsCount: sessions.length,
        activeProjects: new Set(sessions.map((s) => s.projectId)).size,
        interventionsCount: interventions.length,
      },
      entrepreneur: {
        completedTasks: doneTasks,
        totalTasks,
        exercisesEvaluated: audits.filter((a) => a.action === "ai.invoked").length,
      },
      operations: {
        totalAudits,
        aiInvocations: aiAudits,
        errorRate: errorRateStr,
      },
    },
  };

  return <ReportsView initialData={initialData} />;
}
