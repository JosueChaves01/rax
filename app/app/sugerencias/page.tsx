import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { getMentorPortfolio } from "@/lib/services/portfolio";
import { SuggestionsView, type SuggestionItem } from "@/shared/ui/suggestions-view";

export const metadata = { title: "Sugerencias de IA · RAX" };

export default async function SuggestionsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const defaultSuggestions: SuggestionItem[] = [
    {
      id: "learning",
      title: "Recomendar material de aprendizaje",
      subtitle: "Para fortalecer la habilidad de comunicación comercial",
      targetRole: "all",
      recommendation:
        "Te recomiendo asignar el método PREP, ya que ayudará a estructurar respuestas claras y contundentes ante clientes y prospectos indecisos.",
      whyPoints: [
        "Tuviste una tasa de conversión comercial reciente del 40%.",
        "Se detectó fricción en la comunicación del diferencial de valor.",
        "Está alineado directamente con tu objetivo de captar nuevos clientes.",
      ],
      ctaLabel: "Asignar material PREP",
      ctaHref: "/app/aprendizaje",
    },
    {
      id: "session-prep",
      title: "Preparar próxima sesión",
      subtitle: "Basado en la última sesión y tareas pendientes",
      targetRole: "mentor",
      recommendation:
        "Generar agenda tentativa de 60 minutos enfocada en destrabar el cuello de botella en captación comercial.",
      whyPoints: [
        "Hay 2 compromisos de la reunión pasada que siguen sin validar.",
        "Faltan 4 días para el próximo encuentro pactado.",
        "El emprendedor cargó una nueva duda en el chat contextual.",
      ],
      ctaLabel: "Ver y preparar agenda",
      ctaHref: "/app/sesiones",
    },
    {
      id: "progress-report",
      title: "Generar informe de progreso",
      subtitle: "Con datos consolidados de objetivos y tareas completadas",
      targetRole: "all",
      recommendation:
        "Sintetizar el avance del 68% de la etapa para compartir con socios e inversionistas en un reporte ejecutivo trazable.",
      whyPoints: [
        "Se han cumplido 3 de los 5 objetivos principales.",
        "Se acumulan 4 evidencias validadas con clientes.",
        "Permite comparar con la línea base inicial de diagnóstico.",
      ],
      ctaLabel: "Generar informe",
      ctaHref: "/app/reportes",
    },
    {
      id: "detect-blockers",
      title: "Detectar posibles bloqueos",
      subtitle: "Se identificaron 2 tareas con retraso en el cronograma",
      targetRole: "entrepreneur",
      recommendation:
        "Revisar dependencias operativas que impiden el envío de la propuesta comercial.",
      whyPoints: [
        "La tarea superó la fecha límite establecida por 48 horas.",
        "El mentor ofreció una plantilla de soporte no abierta aún.",
        "Desbloquearla habilita la validación del siguiente hito.",
      ],
      ctaLabel: "Resolver bloqueos",
      ctaHref: "/app/tareas",
    },
  ];

  let dynamicSuggestions: SuggestionItem[] = [];

  if (d.actor.role === "mentor") {
    try {
      const portfolio = await getMentorPortfolio(d);
      dynamicSuggestions = portfolio.interventions.slice(0, 4).map((i) => ({
        id: i.id,
        title: i.title,
        subtitle: `Proyecto: ${i.projectName} · Urgencia: ${i.urgency}`,
        targetRole: "mentor" as const,
        recommendation: i.explanation.suggestedAction || i.explanation.whatHappened,
        whyPoints: [
          i.explanation.whatHappened,
          i.explanation.whyItMatters,
          i.explanation.supportingData || "Basado en la actividad reciente del proyecto.",
        ].filter(Boolean),
        ctaLabel: "Atender intervención",
        ctaHref: `/app/p/${i.projectId}`,
      }));
    } catch {
      dynamicSuggestions = [];
    }
  }

  const finalSuggestions =
    dynamicSuggestions.length > 0
      ? [...dynamicSuggestions, ...defaultSuggestions]
      : defaultSuggestions;

  return <SuggestionsView initialSuggestions={finalSuggestions} />;
}
