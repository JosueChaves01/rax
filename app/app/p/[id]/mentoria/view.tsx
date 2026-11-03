import Link from "next/link";
import type { MentorSession } from "@/types/domain";
import { Tag, cx, formatDate } from "@/shared/ui/primitives";
import { AGREEMENT_FREQUENCY_LABEL, AGREEMENT_STATUS_LABEL, EXPERTISE_LABEL, GOAL_LABEL, RESOURCE_CATEGORY_LABEL, WEEKLY_HOURS_LABEL } from "@/features/labels";
import { getDeps } from "@/lib/runtime";
import { suggestContextualResources } from "@/lib/services/resources";
import { loadProjectDocuments, loadWorkspace } from "../data";
import { cycleSteps, type StepState } from "../cycle-track";
import { DocumentsPanel } from "../documents-panel";
import { FollowUpRequest, RequestReview, SessionCard, SharingToggle } from "./sessions";
import { PriorityPanel } from "../orientar/priority-panel";

type W = Awaited<ReturnType<typeof loadWorkspace>>["w"];
type ReviewKind = "first_review" | "second_review";

const WAITING: Record<ReviewKind, string> = {
  first_review: "Todavía no te pidieron la primera revisión. Se pide cuando la persona emprendedora confirma su resumen inicial.",
  second_review: "Todavía no te pidieron la segunda revisión. Se pide cuando hay al menos un resultado registrado.",
};

const PAST_LABEL: Record<MentorSession["kind"], string> = {
  first_review: "Primera revisión",
  second_review: "Segunda revisión",
  follow_up: "Seguimiento",
  exploratory: "Sesión exploratoria",
  evaluation: "Evaluación de ciclo",
};

/**
 * El ciclo de mentoría como un solo hilo (Orientar y Decidir muestran el mismo): lo hecho queda en una
 * línea, lo que viene en gris y el paso de la página se abre con su sesión en tres momentos.
 * A la derecha, todo el material del ciclo en una columna.
 */
export async function MentoringView({ id, kind }: { id: string; kind: ReviewKind }) {
  const [{ w, actor }, docs] = await Promise.all([loadWorkspace(id), loadProjectDocuments(id)]);
  const d = await getDeps();
  const suggestedResources = d && w.isMentorView ? await suggestContextualResources(d, id) : [];
  const mentorNames = w.mentors.map((m) => w.people[m]?.name).filter(Boolean) as string[];
  const { steps, cycleNumber, followUps } = cycleSteps(w);
  const step = (sid: (typeof steps)[number]["id"]) => steps.find((s) => s.id === sid)!;

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
  const firstDone = w.sessions.some((s) => s.kind === "first_review" && s.status === "completed");

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

  /** Lo que se hace en una revisión: la sesión abierta (o cómo pedirla), los seguimientos y lo ya hecho. */
  const review = (k: ReviewKind) => {
    const isFirst = k === "first_review";
    const mine = (s: MentorSession) => (isFirst ? s.kind !== "second_review" && s.kind !== "evaluation" : s.kind === "second_review" || s.kind === "evaluation");
    const sessions = w.sessions.filter(mine);
    const open = sessions.filter((s) => s.status !== "completed").sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt));
    const past = sessions.filter((s) => s.status === "completed").reverse();
    const reviewOpen = w.sessions.some((s) => s.kind === k && s.status !== "completed");
    const canRequest = w.permissions["mentor.request_review"] && !w.isMentorView && !reviewOpen && !(isFirst && firstDone);
    const ready = isFirst ? !!w.diagnosis.summaryConfirmedAt : w.results.length > 0;

    return (
      <div className="space-y-4">
        {open.length > 0 && <ul className="space-y-4">{open.map(card)}</ul>}
        {canRequest && <RequestReview projectId={id} kind={k} ready={ready} />}
        {open.length === 0 && !canRequest && past.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
            {w.isMentorView
              ? WAITING[k]
              : !mentorNames.length
                ? "Todavía no tenés mentor. Podés seguir conversando y ordenando información; la revisión se pide cuando la administración te asigne a alguien."
                : "No hay una sesión abierta."}
          </p>
        )}

        {isFirst && firstDone &&
          (w.phase === "prioritizing" ? (
            <PriorityPanel projectId={id} canPrioritize={w.permissions["diagnosis.prioritize"]} problems={priorityProblems} />
          ) : (
            topProblem && (
              <details className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="mr-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-emerald-800">Problema a investigar</span>
                    <span className="font-semibold text-slate-900">{topProblem.title}</span>
                  </span>
                  <span className="text-xs text-emerald-800">Ver prioridades</span>
                </summary>
                <div className="mt-4">
                  <PriorityPanel projectId={id} canPrioritize={w.permissions["diagnosis.prioritize"]} problems={priorityProblems} />
                </div>
              </details>
            )
          ))}

        {past.length > 0 && (
          <ul className="space-y-2">
            {past.map((s) => (
              <li key={s.id}>
                <details className="group rounded-xl border border-slate-200/80 bg-white">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {PAST_LABEL[s.kind]} <span className="font-normal text-slate-500">· {formatDate(s.completedAt ?? s.createdAt)}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {s.decision ? "Con decisión" : s.postSessionSynthesis ? "Con síntesis" : "Cerrada"}
                      <span className="ml-2 inline-block transition-transform group-open:rotate-90">›</span>
                    </span>
                  </summary>
                  <ul className="px-2 pb-2">{card(s)}</ul>
                </details>
              </li>
            ))}
          </ul>
        )}

        {isFirst && w.permissions["mentor.request_review"] && !w.isMentorView && mentorNames.length > 0 && <FollowUpRequest projectId={id} />}
      </div>
    );
  };

  const diagnosed = !!w.diagnosis.summaryConfirmedAt;
  const probar = step("validacion");
  const cierre = step("evaluacion");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-labelledby="ciclo" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ciclo" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Ciclo de mentoría · #{cycleNumber}
          </h2>
          {followUps > 0 && (
            <p className="text-xs text-slate-500">
              {followUps} seguimiento{followUps === 1 ? "" : "s"} en el camino
            </p>
          )}
        </div>

        <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-0.5 before:bg-slate-200">
          <Node n="✓" state={diagnosed ? "done" : "current"} title="Diagnóstico" detail={diagnosed ? `Confirmado · ${formatDate(w.diagnosis.summaryConfirmedAt!)}` : "Por confirmar"}>
            <p className="text-sm text-slate-600">
              {w.items.length} hallazgo{w.items.length === 1 ? "" : "s"} ordenado{w.items.length === 1 ? "" : "s"} en el diagnóstico.{" "}
              <Link href={`/app/p/${id}/diagnostico`} className="font-semibold text-blue-600 hover:underline">
                Ver diagnóstico →
              </Link>
            </p>
          </Node>

          <Node n={1} state={step("orientar").state} title="Primera revisión" detail={step("orientar").detail} focus={kind === "first_review" || step("orientar").state === "current"}>
            {review("first_review")}
          </Node>

          <Node n={2} state={probar.state} title="Probar la hipótesis" detail={probar.detail}>
            <p className="text-sm text-slate-600">
              {w.hypotheses.length} hipótesis · {w.experiments.length} experimento{w.experiments.length === 1 ? "" : "s"} · {w.results.length} resultado
              {w.results.length === 1 ? "" : "s"}.{" "}
              <Link href={`/app/p/${id}/validacion`} className="font-semibold text-blue-600 hover:underline">
                Ir a Probar →
              </Link>
            </p>
          </Node>

          <Node n={3} state={step("decidir").state} title="Segunda revisión" detail={step("decidir").detail} focus={kind === "second_review" || step("decidir").state === "current"}>
            {review("second_review")}
          </Node>

          <Node n={4} state={cierre.state} title="Cierre del ciclo" detail={cierre.detail}>
            <p className="text-sm text-slate-600">
              El mentor compara los objetivos con su línea base y decide si el ciclo se renueva.{" "}
              <Link href={`/app/p/${id}/evaluacion`} className="font-semibold text-blue-600 hover:underline">
                Abrir el cierre →
              </Link>
            </p>
          </Node>
        </ol>
      </section>

      <aside aria-label="Material del ciclo" className="space-y-3 lg:sticky lg:top-20 lg:h-fit">
        <WithWhom w={w} mentorNames={mentorNames} />
        <Agreement w={w} />
        <DocumentsPanel
          projectId={id}
          docs={w.isMentorView ? mentorDocs : mentorDocs.length ? mentorDocs : docs}
          canShare={w.isMentorView && (w.permissions["agent.chat"] ?? false)}
          viewerIsMentor={w.isMentorView}
          only={w.isMentorView || mentorDocs.length ? "mentor" : undefined}
          title={w.isMentorView ? "Documentos que compartiste" : mentorDocs.length ? "Documentos de tu mentor" : "Documentos del proyecto"}
          subtitle={
            w.isMentorView
              ? "La persona emprendedora los ve acá y en Archivo."
              : mentorDocs.length
                ? "Lo que tu mentor compartió para el ciclo."
                : "Tu mentor todavía no compartió documentos."
          }
          compact
        />
        {w.isMentorView && suggestedResources.length > 0 && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Recursos para este momento</h3>
              <Link href="/app/mentor/recursos" className="text-xs font-semibold text-blue-600 hover:underline">
                Biblioteca →
              </Link>
            </div>
            <ul className="mt-2 divide-y divide-slate-100">
              {suggestedResources.map((s) => (
                <li key={s.resource.id} className="py-2 text-xs">
                  <p className="font-semibold text-slate-900">{s.resource.title}</p>
                  <p className="mt-0.5 text-slate-500">{RESOURCE_CATEGORY_LABEL[s.resource.category]}</p>
                  <p className="mt-1 leading-relaxed text-slate-500">{s.whyItHelpsNow}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {w.permissions["project.update"] && !w.isMentorView && (
          <details className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-2xs">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">Privacidad con tu mentor</summary>
            <SharingToggle projectId={id} shared={w.project.shareConversationWithMentor} />
          </details>
        )}
      </aside>
    </div>
  );
}

/**
 * Un paso del hilo. El paso de la página se ve abierto; los demás con algo que mostrar se despliegan
 * desde su línea, y los que vienen quedan como una línea gris.
 */
function Node({
  n,
  state,
  title,
  detail,
  focus,
  children,
}: {
  n: number | string;
  state: StepState;
  title: string;
  detail: string;
  focus?: boolean;
  children: React.ReactNode;
}) {
  const dot = (
    <span
      aria-hidden
      className={cx(
        "absolute left-0 top-0.5 grid h-6 w-6 place-items-center rounded-full border-2 font-mono text-[0.625rem] font-bold",
        state === "done" ? "border-emerald-600 bg-emerald-600 text-white" : state === "current" ? "border-blue-600 bg-white text-blue-600 ring-4 ring-blue-100" : "border-slate-200 bg-white text-slate-400",
      )}
    >
      {state === "done" ? "✓" : n}
    </span>
  );
  const line = (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-0.5">
      <span className={cx("text-sm", state === "upcoming" ? "font-medium text-slate-400" : "font-semibold text-slate-900", focus && "text-base font-bold")}>{title}</span>
      <span className="text-xs text-slate-500">{detail}</span>
      <span className="sr-only">({state === "done" ? "hecho" : state === "current" ? "en curso" : "por venir"})</span>
    </span>
  );

  if (focus) {
    return (
      <li className="relative pl-9" aria-current="step">
        {dot}
        {line}
        <div className="mt-3">{children}</div>
      </li>
    );
  }
  if (state === "upcoming") {
    return (
      <li className="relative pl-9">
        {dot}
        {line}
      </li>
    );
  }
  return (
    <li className="relative pl-9">
      {dot}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
          {line}
          <span aria-hidden className="text-xs text-slate-400 transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">{children}</div>
      </details>
    </li>
  );
}

/** Con quién se trabaja: el mentor (para la persona emprendedora) o lo que espera la persona (para el mentor). */
function WithWhom({ w, mentorNames }: { w: W; mentorNames: string[] }) {
  if (w.isMentorView) {
    const f = w.founderContext;
    if (!f) return null;
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900">Lo que espera {w.people[w.project.ownerId]?.name.split(" ")[0] ?? "la persona"}</h3>
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
      </section>
    );
  }
  if (!mentorNames.length) return null;
  const expertise = w.mentors.flatMap((m) => (w.mentorContext[m]?.expertise ?? []).map((e) => [m, e] as const));
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-2xs">
      <p className="text-slate-500">Tu mentor</p>
      <p className="mt-0.5 text-sm font-bold text-slate-900">{mentorNames.join(", ")}</p>
      {expertise.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {expertise.map(([m, e]) => (
            <Tag key={`${m}-${e}`} color="var(--color-cyan)">
              {EXPERTISE_LABEL[e]}
            </Tag>
          ))}
        </div>
      )}
    </section>
  );
}

/** El acuerdo y los objetivos del ciclo en dos líneas; el detalle se abre en su página. */
function Agreement({ w }: { w: W }) {
  const agreement = [...w.mentorshipAgreements].reverse().find((a) => a.status !== "superseded");
  const goals = w.mentorshipGoals.filter((g) => g.status === "active");
  return (
    <Link
      href={`/app/p/${w.project.id}/acuerdos`}
      className="block rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-2xs transition-colors hover:border-blue-300"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900">Acuerdo y objetivos</span>
        <span aria-hidden className="text-blue-600">
          →
        </span>
      </span>
      <span className="mt-1 block text-slate-500">
        {agreement
          ? `${AGREEMENT_STATUS_LABEL[agreement.status]} · ${AGREEMENT_FREQUENCY_LABEL[agreement.frequency].toLowerCase()}`
          : "Todavía sin acuerdo formal."}
        {" · "}
        {goals.length ? `${goals.length} objetivo${goals.length === 1 ? "" : "s"} activo${goals.length === 1 ? "" : "s"}` : "sin objetivos"}
      </span>
    </Link>
  );
}
