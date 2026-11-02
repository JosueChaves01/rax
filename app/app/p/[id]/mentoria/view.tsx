import Link from "next/link";
import type { MentorSession } from "@/types/domain";
import { Tag, formatDate } from "@/shared/ui/primitives";
import { EXPERTISE_LABEL, GOAL_LABEL, WEEKLY_HOURS_LABEL, RESOURCE_CATEGORY_LABEL } from "@/features/labels";
import { getDeps } from "@/lib/runtime";
import { suggestContextualResources } from "@/lib/services/resources";
import { loadProjectDocuments, loadWorkspace } from "../data";
import { CycleTrack } from "../cycle-track";
import { DocumentsPanel } from "../documents-panel";
import { FollowUpRequest, RequestReview, SessionCard, SharingToggle } from "./sessions";
import { PriorityPanel } from "../orientar/priority-panel";

const COPY: Record<"first_review" | "second_review", { stage: string; title: readonly [string, string]; lead: string; mentorLead: string; waiting: string }> = {
  first_review: {
    stage: "Etapa 2 · Orientar",
    title: ["Revisión", "con el mentor."],
    lead: "Tu mentor mira el diagnóstico con vos y acuerdan qué problema investigar primero. Entre revisiones podés agendar seguimientos.",
    mentorLead: "Revisás el diagnóstico con la persona emprendedora y acuerdan qué problema investigar primero. Los seguimientos también se trabajan acá.",
    waiting: "Todavía no te pidieron la primera revisión. Se pide cuando la persona emprendedora confirma su resumen inicial.",
  },
  second_review: {
    stage: "Etapa 4 · Decidir",
    title: ["Segunda", "revisión."],
    lead: "Se contrastan los resultados con los criterios fijados antes de probar y tu mentor decide cómo seguir.",
    mentorLead: "Contrastás los resultados con los criterios fijados antes de probar y registrás la decisión.",
    waiting: "Todavía no te pidieron la segunda revisión. Se pide cuando hay al menos un resultado registrado.",
  },
};

/**
 * Pantalla de una revisión del ciclo (la primera en Orientar, la segunda en Decidir): dónde está el
 * ciclo, la sesión abierta en tres pasos (o cómo pedirla), los documentos del mentor y el historial.
 */
export async function MentoringView({ id, kind }: { id: string; kind: "first_review" | "second_review" }) {
  const [{ w, actor }, docs] = await Promise.all([loadWorkspace(id), loadProjectDocuments(id)]);
  const copy = COPY[kind];
  const isFirst = kind === "first_review";
  const d = await getDeps();
  const suggestedResources = d && w.isMentorView ? await suggestContextualResources(d, id) : [];
  const mentorNames = w.mentors.map((m) => w.people[m]?.name).filter(Boolean);

  // La primera revisión vive con los seguimientos; la segunda con la evaluación formal.
  const mine = (s: MentorSession) => (isFirst ? s.kind !== "second_review" && s.kind !== "evaluation" : s.kind === "second_review" || s.kind === "evaluation");
  const sessions = w.sessions.filter(mine);
  const openSessions = sessions.filter((s) => s.status !== "completed").sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt));
  const pastSessions = sessions.filter((s) => s.status === "completed").reverse();

  const reviewOpen = w.sessions.some((s) => s.kind === kind && s.status !== "completed");
  const firstDone = w.sessions.some((s) => s.kind === "first_review" && s.status === "completed");
  const canRequest = w.permissions["mentor.request_review"] && !w.isMentorView && !reviewOpen && !(isFirst && firstDone);
  const ready = isFirst ? !!w.diagnosis.summaryConfirmedAt : w.results.length > 0;

  const problems = w.items.filter((i) => i.category === "problem" && i.reviewStatus !== "rejected" && i.infoType !== "unknown");
  const priorityProblems = problems.map((i) => ({
    id: i.id,
    title: i.title,
    content: i.content,
    version: i.version,
    priority: i.priority && { rank: i.priority.rank, rationale: i.priority.rationale, setByName: w.people[i.priority.setBy]?.name ?? "Persona" },
  }));
  const topProblem = problems.find((i) => i.priority?.rank === 1);
  const mentorDocs = docs.filter((x) => x.fromMentor);

  const card = (s: MentorSession) => (
    <SessionCard
      key={s.id}
      projectId={id}
      session={s}
      people={w.people as Record<string, { id: string; name: string; role: string }>}
      isSessionMentor={s.mentorId === actor.id}
      isOwner={w.project.ownerId === actor.id}
      items={w.items.filter((i) => i.reviewStatus !== "rejected").map((i) => ({ id: i.id, title: i.title }))}
      problems={problems.map((i) => ({ id: i.id, title: i.title, priority: i.priority && { rank: i.priority.rank, rationale: i.priority.rationale } }))}
      hypotheses={w.hypotheses}
      experiments={w.experiments}
      results={w.results}
      goals={w.mentorshipGoals}
      roadmapMilestones={w.roadmapMilestones}
    />
  );

  return (
    <div className="space-y-6">
      <CycleTrack w={w} active={isFirst ? "orientar" : "decidir"} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{copy.stage}</p>
          <h2 className="display mt-2 text-4xl">
            {copy.title[0]} <span className="text-highlight">{copy.title[1]}</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{w.isMentorView ? copy.mentorLead : copy.lead}</p>
        </div>
        <WithWhom w={w} mentorNames={mentorNames as string[]} />
      </div>

      {/* Ahora: la sesión abierta, o cómo pedirla. */}
      <section aria-labelledby="now" className="space-y-4">
        <h3 id="now" className="sr-only">
          Sesión actual
        </h3>
        {openSessions.length > 0 && <ul className="space-y-4">{openSessions.map(card)}</ul>}

        {canRequest && <RequestReview projectId={id} kind={kind} ready={ready} />}

        {openSessions.length === 0 && !canRequest && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-8 text-center text-sm text-slate-500">
            {w.isMentorView
              ? copy.waiting
              : !mentorNames.length
                ? "Todavía no tenés mentor. Podés seguir conversando y ordenando información; la revisión se pide cuando la administración te asigne a alguien."
                : isFirst && firstDone
                  ? "La primera revisión ya está hecha. Si necesitás hablar con tu mentor antes de la segunda, agendá un seguimiento."
                  : "No hay una sesión abierta."}
          </div>
        )}

        {isFirst && w.permissions["mentor.request_review"] && !w.isMentorView && mentorNames.length > 0 && (
          <div className="px-1">
            <FollowUpRequest projectId={id} />
          </div>
        )}
      </section>

      {/* La prioridad se elige al cerrar la revisión: abierta solo si quedó sin elegir. */}
      {isFirst && firstDone &&
        (w.phase === "prioritizing" ? (
          <PriorityPanel projectId={id} canPrioritize={w.permissions["diagnosis.prioritize"]} problems={priorityProblems} />
        ) : (
          topProblem && (
            <details className="rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-4 shadow-xs sm:p-5">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="eyebrow mr-2 text-emerald-800">Problema a investigar</span>
                  <span className="font-semibold text-slate-900">{topProblem.title}</span>
                </span>
                <Link href={`/app/p/${id}/validacion`} className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600 hover:text-blue-700">
                  Ir a Probar →
                </Link>
              </summary>
              <div className="mt-4">
                <PriorityPanel projectId={id} canPrioritize={w.permissions["diagnosis.prioritize"]} problems={priorityProblems} />
              </div>
            </details>
          )
        ))}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <DocumentsPanel
          projectId={id}
          docs={w.isMentorView ? mentorDocs : mentorDocs.length ? mentorDocs : docs}
          canShare={w.isMentorView && (w.permissions["agent.chat"] ?? false)}
          viewerIsMentor={w.isMentorView}
          only={w.isMentorView || mentorDocs.length ? "mentor" : undefined}
          title={w.isMentorView ? "Documentos que compartiste" : mentorDocs.length ? "Documentos de tu mentor" : "Documentos del proyecto"}
          subtitle={
            w.isMentorView
              ? "La persona emprendedora los ve acá y en Archivo; el asistente también los usa."
              : mentorDocs.length
                ? "Lo que tu mentor compartió para trabajar en el ciclo. Descargalos en PDF o Word."
                : "Tu mentor todavía no compartió documentos; estos son los del proyecto."
          }
          compact
        />

        {w.isMentorView && suggestedResources.length > 0 ? (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">Recursos para este momento</h3>
              <Link href="/app/mentor/recursos" className="text-xs font-semibold text-blue-600 hover:underline">
                Biblioteca →
              </Link>
            </div>
            <ul className="mt-3 space-y-2.5">
              {suggestedResources.map((s) => (
                <li key={s.resource.id} className="rounded-xl border border-slate-200/80 p-3 text-xs">
                  <p className="font-semibold text-slate-900">{s.resource.title}</p>
                  <div className="mt-1">
                    <Tag color="var(--color-cyan)">{RESOURCE_CATEGORY_LABEL[s.resource.category]}</Tag>
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-500">{s.whyItHelpsNow}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <CycleLinks id={id} isFirst={isFirst} />
        )}
      </div>

      {pastSessions.length > 0 && (
        <section aria-labelledby="past" className="space-y-3">
          <h3 id="past" className="eyebrow text-slate-500">
            Historial de sesiones ({pastSessions.length})
          </h3>
          <ul className="space-y-2.5">
            {pastSessions.map((s) => (
              <li key={s.id}>
                <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                    <span className="text-sm font-semibold text-slate-900">
                      {PAST_LABEL[s.kind]} <span className="font-normal text-slate-500">· {formatDate(s.completedAt ?? s.createdAt)}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {s.decision ? "Con decisión" : s.postSessionSynthesis ? "Con síntesis" : "Cerrada"}
                      <span className="ml-2 inline-block transition-transform group-open:rotate-90">›</span>
                    </span>
                  </summary>
                  <ul className="px-3 pb-3">{card(s)}</ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isFirst && w.permissions["project.update"] && !w.isMentorView && (
        <details className="rounded-2xl border border-slate-200/80 bg-white px-5 py-3.5 shadow-2xs">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Privacidad con tu mentor</summary>
          <SharingToggle projectId={id} shared={w.project.shareConversationWithMentor} />
        </details>
      )}
    </div>
  );
}

const PAST_LABEL: Record<MentorSession["kind"], string> = {
  first_review: "Primera revisión",
  second_review: "Segunda revisión",
  follow_up: "Seguimiento",
  exploratory: "Sesión exploratoria",
  evaluation: "Evaluación de ciclo",
};

/** Con quién se trabaja: el mentor (para la persona emprendedora) o lo que espera la persona (para el mentor). */
function WithWhom({ w, mentorNames }: { w: Awaited<ReturnType<typeof loadWorkspace>>["w"]; mentorNames: string[] }) {
  if (w.isMentorView) {
    const f = w.founderContext;
    if (!f) return null;
    return (
      <div className="max-w-sm rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs shadow-2xs">
        <p className="eyebrow text-slate-500">Lo que espera {w.people[w.project.ownerId]?.name.split(" ")[0] ?? "la persona"}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {f.goals.map((g) => (
            <Tag key={g} color="var(--color-highlight)">
              {GOAL_LABEL[g]}
            </Tag>
          ))}
        </div>
        {f.mentorExpectation && <p className="mt-2 font-medium text-slate-800">«{f.mentorExpectation}»</p>}
        <p className="mt-1 text-slate-500">
          {f.sector || "Rubro sin indicar"} · {WEEKLY_HOURS_LABEL[f.weeklyHours].toLowerCase()} por semana
        </p>
      </div>
    );
  }
  if (!mentorNames.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs shadow-2xs">
      <p className="eyebrow text-slate-500">Tu mentor</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{mentorNames.join(", ")}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {w.mentors.flatMap((m) => (w.mentorContext[m]?.expertise ?? []).map((e) => <Tag key={`${m}-${e}`} color="var(--color-cyan)">{EXPERTISE_LABEL[e]}</Tag>))}
      </div>
    </div>
  );
}

/** Lo que acompaña a la revisión dentro del ciclo, para no tener que buscarlo en la navegación. */
function CycleLinks({ id, isFirst }: { id: string; isFirst: boolean }) {
  const links = isFirst
    ? [
        ["acuerdos", "Acuerdo y objetivos", "Cómo van a trabajar y qué quieren lograr en el ciclo."],
        ["validacion", "Hipótesis y experimentos", "Lo que sigue después de priorizar el problema."],
      ]
    : [
        ["validacion", "Resultados de Probar", "Los experimentos y la evidencia que se revisan."],
        ["evaluacion", "Cierre del ciclo", "Evaluación final del mentor: renovar o cerrar."],
      ];
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
      <h3 className="text-base font-bold text-slate-900">En este ciclo</h3>
      <ul className="mt-3 space-y-2">
        {links.map(([slug, label, hint]) => (
          <li key={slug}>
            <Link href={`/app/p/${id}/${slug}`} className="block rounded-xl border border-slate-200/80 px-3 py-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
              <span className="text-sm font-semibold text-slate-900">{label} →</span>
              <span className="block text-xs text-slate-500">{hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
