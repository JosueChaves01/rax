import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { getMentorPortfolio } from "@/lib/services/portfolio";
import { listMyProjects } from "@/lib/services/projects";
import { SuggestionsView, type SuggestionItem } from "@/shared/ui/suggestions-view";

export const metadata = { title: "Sugerencias de IA · RAX" };

export default async function SuggestionsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const dynamicSuggestions: SuggestionItem[] = [];

  if (d.actor.role === "mentor") {
    try {
      const portfolio = await getMentorPortfolio(d);
      for (const i of portfolio.interventions.slice(0, 6)) {
        dynamicSuggestions.push({
          id: i.id,
          title: i.title,
          subtitle: `Proyecto: ${i.projectName} · Urgencia: ${i.urgency}`,
          targetRole: "mentor" as const,
          recommendation: i.explanation.suggestedAction || i.explanation.whatHappened,
          whyPoints: [
            i.explanation.whatHappened,
            i.explanation.whyItMatters,
            i.explanation.supportingData,
          ].filter(Boolean),
          ctaLabel: "Atender intervención",
          ctaHref: `/app/p/${i.projectId}`,
        });
      }
    } catch {
      // Ignorar error transitorio
    }
  } else {
    // Para emprendedor: sugerencias derivadas de sus tareas y estado del proyecto real
    try {
      const projects = await listMyProjects(d);
      for (const p of projects) {
        const tasks = await d.repo.tasks.list({ projectId: p.id });
        const now = Date.now();
        const pendingTasks = tasks.filter((t) => t.status !== "done");
        const overdueTasks = pendingTasks.filter(
          (t) => t.dueDate && new Date(t.dueDate).getTime() < now
        );

        if (overdueTasks.length > 0) {
          dynamicSuggestions.push({
            id: `sug-overdue-${p.id}`,
            title: `Destrabar tareas pendientes en ${p.name}`,
            subtitle: `${overdueTasks.length} tarea(s) con fecha cumplida o próxima`,
            targetRole: "entrepreneur" as const,
            recommendation: `Revisa la hoja de tareas de ${p.name} para actualizar el estado de los compromisos o reportar bloqueos a tu mentor.`,
            whyPoints: [
              `Hay ${overdueTasks.length} tarea(s) que requieren validación.`,
              "Mantener las tareas al día permite calcular con precisión el avance del ciclo.",
            ],
            ctaLabel: "Ver tareas",
            ctaHref: "/app/tareas",
          });
        }

        const hypotheses = await d.repo.hypotheses.list({ projectId: p.id });
        const unvalidated = hypotheses.filter((h) => h.status === "draft" || h.status === "testing");
        if (unvalidated.length > 0) {
          dynamicSuggestions.push({
            id: `sug-hypo-${p.id}`,
            title: `Diseñar experimentos de validación (${p.name})`,
            subtitle: `${unvalidated.length} hipótesis activas`,
            targetRole: "entrepreneur" as const,
            recommendation: "Configura experimentos con métricas claras para contrastar tus supuestos clave frente al mercado.",
            whyPoints: [
              `Existen ${unvalidated.length} hipótesis en proceso de validación.`,
              "Contar con evidencia empírica acelera las decisiones del siguiente ciclo.",
            ],
            ctaLabel: "Ir a validación",
            ctaHref: `/app/p/${p.id}/validacion`,
          });
        }
      }
    } catch {
      // Continuar con lista disponible
    }
  }

  return <SuggestionsView initialSuggestions={dynamicSuggestions} />;
}
