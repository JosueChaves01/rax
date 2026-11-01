"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { MentorPortfolio } from "@/lib/services/portfolio";
import type { InterventionCategory } from "@/types/domain";
import { dismissInterventionAction } from "@/app/actions";
import {
  INTERVENTION_CATEGORY_LABEL,
  INTERVENTION_URGENCY_LABEL,
  MENTORSHIP_STAGE_LABEL,
} from "@/features/labels";
import {
  Button,
  Card,
  Empty,
  Heading,
  Meter,
  Notice,
  Tag,
  cx,
  formatDate,
} from "@/shared/ui/primitives";

interface Props {
  portfolio: MentorPortfolio;
  mentorName: string;
}

type SortBy = "urgency" | "name" | "session";

const URGENCY_COLOR = {
  high: "var(--color-danger, #ff4d4d)",
  medium: "var(--color-highlight, #f59e0b)",
  low: "var(--color-cyan, #06b6d4)",
};

export function PortfolioView({ portfolio, mentorName }: Props) {
  const [interventions, setInterventions] = useState(portfolio.interventions);
  const [sortBy, setSortBy] = useState<SortBy>("urgency");
  const [expandedIntervention, setExpandedIntervention] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const sortedProjects = [...portfolio.projects].sort((a, b) => {
    if (sortBy === "urgency") return b.urgencyScore - a.urgencyScore;
    if (sortBy === "name") return a.projectName.localeCompare(b.projectName);
    if (sortBy === "session") {
      const aDate = a.nextSessionDate ?? "9999";
      const bDate = b.nextSessionDate ?? "9999";
      return aDate.localeCompare(bDate);
    }
    return 0;
  });

  const handleDismiss = (relationId: string, category: InterventionCategory, intId: string) => {
    startTransition(async () => {
      setActionError(null);
      const res = await dismissInterventionAction({
        relationId,
        category,
        interventionId: intId,
      });
      if (res && !res.ok) {
        setActionError(res.error);
      } else {
        setInterventions((prev) => prev.filter((i) => i.id !== intId));
      }
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Cabina de control de mentoría</p>
          <Heading level={1} highlight="tu cartera." className="mt-2">
            Hola, {mentorName.split(" ")[0]} ·
          </Heading>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/mentor/recursos">
            <Button variant="secondary" size="sm">
              📚 Biblioteca de recursos
            </Button>
          </Link>
          <Link href="/app">
            <Button variant="ghost" size="sm">
              ← Vista general
            </Button>
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="mt-6">
          <Notice tone="error">{actionError}</Notice>
        </div>
      )}

      {/* Indicadores clave del portfolio */}
      <section aria-label="Métricas de cartera" className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Proyectos activos</p>
          <p className="display mt-2 text-4xl text-slate-900">{portfolio.stats.totalActiveProjects}</p>
          <p className="mt-1 text-xs text-faint">Emprendimientos en seguimiento</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-danger">Requieren atención</p>
          <p className="display mt-2 text-4xl text-danger">{portfolio.stats.projectsNeedingAttention}</p>
          <p className="mt-1 text-xs text-faint">Con bloqueos o sin sesión</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-blue-700">Próximas sesiones</p>
          <p className="display mt-2 text-4xl text-blue-700">{portfolio.stats.upcomingSessionsCount}</p>
          <p className="mt-1 text-xs text-faint">Encuentros agendados</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-highlight">Acuerdos pendientes</p>
          <p className="display mt-2 text-4xl text-highlight">{portfolio.stats.pendingAgreementsCount}</p>
          <p className="mt-1 text-xs text-faint">Por rubricar o confirmar</p>
        </Card>
      </section>

      {/* Bandeja «Mi próxima intervención» */}
      <section aria-label="Bandeja de intervenciones prioritarias" className="mt-12">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="display text-2xl text-slate-900">Bandeja «Mi próxima intervención»</h2>
            <p className="text-sm text-muted">
              Recomendaciones del sistema justificadas en hechos observados para anticipar bloqueos y preparar encuentros.
            </p>
          </div>
          <span className="font-mono text-xs text-faint">
            {interventions.length} {interventions.length === 1 ? "alerta activa" : "alertas activas"}
          </span>
        </div>

        {interventions.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
            <p className="font-semibold text-ok">✓ Toda tu cartera está al día</p>
            <p className="mt-1 text-xs text-muted">
              No hay bloqueos operativos sin diagnosticar, acuerdos pendientes ni sesiones próximas desatendidas.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {interventions.map((int) => {
              const isExpanded = expandedIntervention === int.id;
              return (
                <li key={int.id}>
                  <Card className="overflow-hidden border-slate-200 transition-colors hover:border-slate-300">
                    <div className="p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Tag color={URGENCY_COLOR[int.urgency]}>
                            {INTERVENTION_URGENCY_LABEL[int.urgency]}
                          </Tag>
                          <Tag>{INTERVENTION_CATEGORY_LABEL[int.category]}</Tag>
                          <span className="font-semibold text-slate-900">{int.projectName}</span>
                        </div>
                        <span className="font-mono text-[0.6875rem] text-faint">
                          {formatDate(int.createdAt)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-slate-900">{int.title}</h3>
                          <p className="mt-1 text-sm text-muted line-clamp-2">
                            {int.explanation.suggestedAction}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedIntervention(isExpanded ? null : int.id)}
                            className="text-xs font-semibold text-blue-600 hover:underline"
                          >
                            {isExpanded ? "Ocultar justificación" : "Ver justificación"}
                          </button>
                          <Link href={`/app/p/${int.projectId}/orientar`}>
                            <Button variant="secondary" size="sm">
                              Ir al proyecto →
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleDismiss(int.relationId, int.category, int.id)}
                            title="Descartar recomendación"
                          >
                            ✕
                          </Button>
                        </div>
                      </div>

                      {/* Explicación expandida */}
                      {isExpanded && (
                        <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs space-y-2">
                          <div>
                            <span className="font-semibold text-slate-900">¿Qué ocurrió?: </span>
                            <span className="text-muted">{int.explanation.whatHappened}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900">¿Por qué importa?: </span>
                            <span className="text-muted">{int.explanation.whyItMatters}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900">Datos que lo sustentan: </span>
                            <span className="text-muted">{int.explanation.supportingData}</span>
                          </div>
                          <div className="pt-2 border-t border-slate-200">
                            <span className="font-semibold text-blue-700">Acción sugerida: </span>
                            <span className="text-slate-900">{int.explanation.suggestedAction}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Lista de Cartera de Emprendimientos */}
      <section aria-label="Cartera de proyectos" className="mt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="display text-2xl text-slate-900">Cartera de emprendimientos</h2>
            <p className="text-sm text-muted">
              Visibilidad integral sobre la salud, acuerdos, ejecución y próximas reuniones de cada cliente.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="urgency">Mayor urgencia primero</option>
              <option value="name">Nombre alfabético</option>
              <option value="session">Próxima sesión agendada</option>
            </select>
          </div>
        </div>

        {sortedProjects.length === 0 ? (
          <div className="mt-6">
            <Empty title="Sin proyectos asignados">
              No tienes emprendimientos en tu cartera en este momento.
            </Empty>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {sortedProjects.map((p) => {
              const hasAlert = p.urgencyScore >= 30;
              return (
                <Card
                  key={p.relationId}
                  className={cx(
                    "p-6 flex flex-col justify-between transition-colors",
                    hasAlert ? "border-amber-200 bg-amber-50/60" : "hover:border-blue-300",
                  )}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Tag color={hasAlert ? "var(--color-highlight)" : "var(--color-cyan)"}>
                        {MENTORSHIP_STAGE_LABEL[p.stage]}
                      </Tag>
                      {p.urgencyScore > 0 && (
                        <span className="font-mono text-xs text-faint">
                          Índice de urgencia: {p.urgencyScore}%
                        </span>
                      )}
                    </div>

                    <h3 className="display mt-3 text-2xl text-slate-900">{p.projectName}</h3>
                    <p className="text-xs text-muted">Emprendedor/a: {p.entrepreneurName}</p>

                    {/* Señales de salud activas */}
                    {p.signals.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {p.signals.map((sig, idx) => (
                          <span
                            key={idx}
                            className="inline-block rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[0.6875rem] text-muted"
                          >
                            ⚠️ {sig}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Progreso de objetivos */}
                    <div className="mt-4">
                      <Meter
                        value={p.goalsAchievedCount}
                        total={Math.max(p.goalsCount, 1)}
                        label={`Objetivos de mentoría (${p.goalsAchievedCount} de ${p.goalsCount} logrados)`}
                      />
                    </div>

                    {/* Resumen de ejecución de tareas */}
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs">
                      <div>
                        <span className="block font-mono text-base font-semibold">{p.totalTasksCount}</span>
                        <span className="text-faint text-[0.6875rem]">Total tareas</span>
                      </div>
                      <div>
                        <span className="block font-mono text-base font-semibold text-ok">{p.completedTasksCount}</span>
                        <span className="text-faint text-[0.6875rem]">Completadas</span>
                      </div>
                      <div>
                        <span className={cx("block font-mono text-base font-semibold", p.blockedTasksCount > 0 ? "text-danger" : "text-slate-900")}>
                          {p.blockedTasksCount}
                        </span>
                        <span className="text-faint text-[0.6875rem]">Bloqueadas</span>
                      </div>
                    </div>

                    {/* Próxima sesión */}
                    <div className="mt-4 flex items-center justify-between text-xs text-muted">
                      <span>
                        {p.nextSessionDate
                          ? `📅 Próx. sesión: ${formatDate(p.nextSessionDate)}`
                          : p.lastSessionDate
                          ? `Última sesión: ${formatDate(p.lastSessionDate)}`
                          : "Sin sesiones agendadas"}
                      </span>
                    </div>
                  </div>

                  {/* Botones de acción */}
                  <div className="mt-6 flex items-center justify-between gap-2 pt-4 border-t border-slate-200">
                    <Link
                      href={`/app/p/${p.projectId}/orientar`}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Sesiones y notas →
                    </Link>
                    <Link href={`/app/p/${p.projectId}`}>
                      <Button variant="secondary" size="sm">
                        Ver expediente
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
