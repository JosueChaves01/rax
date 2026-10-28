import Link from "next/link";
import type { MentorSession } from "@/types/domain";
import { Empty, Notice, Tag } from "@/shared/ui/primitives";
import { EXPERTISE_LABEL, GOAL_LABEL, WEEKLY_HOURS_LABEL } from "@/features/labels";
import { loadWorkspace } from "../data";
import { ReviewRequests, SessionCard, SharingToggle } from "./sessions";

const COPY = {
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
} as const;

/** Revisión del mentor de una etapa: la primera orienta (etapa 2), la segunda decide (etapa 4). */
export async function MentoringView({ id, kind }: { id: string; kind: MentorSession["kind"] }) {
  const { w, actor } = await loadWorkspace(id);
  const copy = COPY[kind];
  const mentorNames = w.mentors.map((m) => w.people[m]?.name).filter(Boolean);
  const sessions = w.sessions.filter((s) => s.kind === kind).reverse();
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
          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="eyebrow">Mentor asignado</p>
            {mentorNames.length ? (
              <>
                <p className="display mt-2 text-2xl">{mentorNames.join(", ")}</p>
                {w.mentors.map((m) =>
                  w.mentorContext[m] ? (
                    <div key={m} className="mt-2 flex flex-wrap gap-1.5">
                      {w.mentorContext[m].expertise.map((e) => (
                        <Tag key={e} color="var(--color-cyan)">{EXPERTISE_LABEL[e]}</Tag>
                      ))}
                    </div>
                  ) : null,
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
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
        <div className="rounded-2xl border border-line bg-panel p-5">
          <p className="eyebrow">Lo que {w.people[w.project.ownerId]?.name.split(" ")[0] ?? "la persona"} espera de RAX</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {w.founderContext.goals.map((g) => (
              <Tag key={g} color="var(--color-highlight)">{GOAL_LABEL[g]}</Tag>
            ))}
          </div>
          {w.founderContext.mentorExpectation && <p className="mt-3 text-sm">«{w.founderContext.mentorExpectation}»</p>}
          <p className="mt-2 text-xs text-muted">
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
              items={w.items.filter((i) => i.reviewStatus !== "rejected").map((i) => ({ id: i.id, title: i.title }))}
              hypotheses={w.hypotheses}
              experiments={w.experiments}
              results={w.results}
            />
          ))}
        </ul>
      )}

      {kind === "first_review" && firstDone && (
        <div className="rounded-2xl border border-line bg-panel p-5">
          <p className="eyebrow">Después del acuerdo</p>
          <p className="mt-2 text-sm">
            {w.phase === "prioritizing"
              ? "Falta priorizar el problema a investigar primero, con una justificación. Se hace sobre las tarjetas de problema del diagnóstico."
              : "El problema a investigar ya está priorizado. El paso siguiente es convertirlo en una hipótesis."}
          </p>
          <Link
            href={`/app/p/${id}/${w.phase === "prioritizing" ? "diagnostico" : "validacion"}`}
            className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:text-accent-strong"
          >
            {w.phase === "prioritizing" ? "Priorizar el problema →" : "Ir a Probar →"}
          </Link>
        </div>
      )}
    </div>
  );
}
