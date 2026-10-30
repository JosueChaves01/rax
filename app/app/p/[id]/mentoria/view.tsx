import Link from "next/link";
import type { MentorSession } from "@/types/domain";
import { Empty, Notice, Tag } from "@/shared/ui/primitives";
import { EXPERTISE_LABEL, GOAL_LABEL, WEEKLY_HOURS_LABEL, RESOURCE_CATEGORY_LABEL } from "@/features/labels";
import { getDeps } from "@/lib/runtime";
import { suggestContextualResources } from "@/lib/services/resources";
import { loadWorkspace } from "../data";
import { ReviewRequests, SessionCard, SharingToggle } from "./sessions";
import { PriorityPanel } from "../orientar/priority-panel";

const COPY: Record<MentorSession["kind"], { stage: string; title: readonly [string, string]; empty: string }> = {
  first_review: {
    stage: "Etapa 2 · Orientar",
    title: ["Primera", "revisión."],
    empty:
      "La primera revisión se pide cuando el emprendedor confirma su resumen inicial. Así el mentor orienta el enfoque antes de que se arme un plan rígido.",
  },
  second_review: {
    stage: "Etapa 4 · Decidir",
    title: ["Segunda", "revisión."],
    empty: "La segunda revisión se pide cuando hay al menos un resultado registrado. Ahí se contrastan los resultados con los criterios y se decide cómo seguir.",
  },

  exploratory: {
    stage: "Etapa 1 · Explorar",
    title: ["Sesión", "exploratoria."],
    empty: "Espacio para evaluar química, expectativas de tiempo y compatibilidad mutua antes de fijar acuerdos formales.",
  },
  follow_up: {
    stage: "Etapa 3 · Ejecución",
    title: ["Sesión de", "seguimiento."],
    empty: "Encuentro periódico de acompañamiento para revisar avances, desbloquear obstáculos y acordar nuevos compromisos.",
  },
  evaluation: {
    stage: "Etapa 5 · Evaluar",
    title: ["Evaluación de", "ciclo."],
    empty: "Evaluación formal de resultados contrastados con la línea base y cierre o renovación de etapa.",
  },
};

/** Revisión del mentor de una etapa: la primera orienta (etapa 2), la segunda decide (etapa 4). */
export async function MentoringView({ id, kind }: { id: string; kind: MentorSession["kind"] }) {
  const { w, actor } = await loadWorkspace(id);
  const copy = COPY[kind];
  const d = await getDeps();
  const suggestedResources = d && w.isMentorView ? await suggestContextualResources(d, id) : [];
  const mentorNames = w.mentors.map((m) => w.people[m]?.name).filter(Boolean);
  const sessions =
    kind === "second_review"
      ? w.sessions.filter((s) => s.kind === "second_review" || s.kind === "evaluation").reverse()
      : w.sessions.filter((s) => s.kind !== "second_review" && s.kind !== "evaluation").reverse();
  const firstDone = w.sessions.some((s) => s.kind === "first_review" && s.status === "completed");

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{copy.stage}</p>
        <h2 className="display mt-2 text-4xl">
          {copy.title[0]} <span className="text-highlight">{copy.title[1]}</span>
        </h2>
      </div>

      {!w.isMentorView && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs">
            <p className="eyebrow text-slate-500 dark:text-slate-400">Mentor asignado</p>
            {mentorNames.length ? (
              <>
                <p className="display mt-2 text-2xl font-bold text-slate-900 dark:text-white">{mentorNames.join(", ")}</p>
                {w.mentors.map((m) =>
                  w.mentorContext[m] ? (
                    <div key={m} className="mt-2.5 flex flex-wrap gap-1.5">
                      {w.mentorContext[m].expertise.map((e) => (
                        <Tag key={e} color="var(--color-cyan)">{EXPERTISE_LABEL[e]}</Tag>
                      ))}
                    </div>
                  ) : null,
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Todavía no tenés mentor. Podés seguir conversando y ordenando información; las decisiones que requieren revisión humana quedan
                pendientes hasta que la administración asigne a alguien.
              </p>
            )}
            {w.permissions["project.update"] && kind === "first_review" && <SharingToggle projectId={id} shared={w.project.shareConversationWithMentor} />}
          </div>
          {w.permissions["mentor.request_review"] && (
            <ReviewRequests projectId={id} sessions={w.sessions} summaryConfirmed={!!w.diagnosis.summaryConfirmedAt} hasResults={w.results.length > 0} only={kind} />
          )}
        </div>
      )}

      {w.isMentorView && w.founderContext && kind === "first_review" && (
        <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs">
          <p className="eyebrow text-slate-500 dark:text-slate-400">Lo que {w.people[w.project.ownerId]?.name.split(" ")[0] ?? "la persona"} espera de RAX</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {w.founderContext.goals.map((g) => (
              <Tag key={g} color="var(--color-highlight)">{GOAL_LABEL[g]}</Tag>
            ))}
          </div>
          {w.founderContext.mentorExpectation && <p className="mt-3 text-sm text-slate-800 dark:text-slate-200 font-medium">«{w.founderContext.mentorExpectation}»</p>}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {w.founderContext.sector || "Rubro sin indicar"} · {WEEKLY_HOURS_LABEL[w.founderContext.weeklyHours].toLowerCase()} por semana
          </p>
        </div>
      )}

      {w.isMentorView && (
        <Notice>
          Ves este proyecto porque tenés una asignación activa. Tus notas y decisiones quedan registradas con tu nombre. Lo que la IA organizó
          puede no ser definitivo: revisá el origen de cada elemento en el diagnóstico.
        </Notice>
      )}

      {w.isMentorView && suggestedResources.length > 0 && (
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 dark:bg-slate-900 dark:border-blue-900/40 p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow text-blue-700 dark:text-blue-400">Recursos recomendados para el momento actual</p>
            <Link href="/app/mentor/recursos" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Ver biblioteca completa →
            </Link>
          </div>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            {suggestedResources.map((s) => (
              <div key={s.resource.id} className="rounded-xl border border-slate-200/90 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">{s.resource.title}</span>
                  <Tag color="var(--color-cyan)">{RESOURCE_CATEGORY_LABEL[s.resource.category]}</Tag>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[0.6875rem] leading-relaxed">{s.whyItHelpsNow}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <Empty title="Sin revisión todavía">{copy.empty}</Empty>
      ) : (
        <ul className="space-y-4">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              projectId={id}
              session={s}
              notes={w.notes.filter((n) => n.sessionId === s.id)}
              people={w.people as Record<string, { id: string; name: string; role: string }>}
              isSessionMentor={s.mentorId === actor.id}
              isOwner={w.project.ownerId === actor.id}
              items={w.items.filter((i) => i.reviewStatus !== "rejected").map((i) => ({ id: i.id, title: i.title }))}
              hypotheses={w.hypotheses}
              experiments={w.experiments}
              results={w.results}
              goals={w.mentorshipGoals}
              roadmapMilestones={w.roadmapMilestones}
            />
          ))}
        </ul>
      )}

      {kind === "first_review" && firstDone && (
        <PriorityPanel
          projectId={id}
          canPrioritize={w.permissions["diagnosis.prioritize"]}
          problems={w.items
            .filter((i) => i.category === "problem" && i.reviewStatus !== "rejected" && i.infoType !== "unknown")
            .map((i) => ({
              id: i.id,
              title: i.title,
              content: i.content,
              version: i.version,
              priority: i.priority && { rank: i.priority.rank, rationale: i.priority.rationale, setByName: w.people[i.priority.setBy]?.name ?? "Persona" },
            }))}
        />
      )}

      {kind === "first_review" && firstDone && w.phase !== "prioritizing" && (
        <Link href={`/app/p/${id}/validacion`} className="inline-block text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:text-accent-strong">
          Problema priorizado · ir a Probar →
        </Link>
      )}
    </div>
  );
}
