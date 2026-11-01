import Link from "next/link";
import { PHASE_LABEL } from "@/features/labels";
import { STAGES, phasesDone, stageOf, stageState, type Turn } from "@/features/projects/stages";
import { openQuestions, pendingReview } from "@/features/diagnosis/rules";
import { cx, formatDate } from "@/shared/ui/primitives";
import { loadWorkspace } from "./data";
import { nextAction } from "@/lib/services/next-action";
import { DeleteProject } from "./delete-project";

const CTA: Record<string, string> = {
  conversacion: "Ir a la conversación",
  diagnostico: "Abrir el diagnóstico",
  orientar: "Ir a la primera revisión",
  validacion: "Ir a hipótesis y experimentos",
  decidir: "Ir a la segunda revisión",
};

/** Inicio del proyecto: en qué etapa está, qué sigue y a quién le toca. */
export default async function ProjectHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w, actor } = await loadWorkspace(id);
  const stage = stageOf(w.phase);
  const { text, tab, turn } = nextAction(w);
  const hypPending = w.hypotheses.filter((h) => h.status === "pending_approval").length;
  const reviewsAsked = w.sessions.filter((s) => s.status !== "completed").length;
  const mentorName = w.mentors.map((m) => w.people[m]?.name).find(Boolean);
  const ownerName = w.people[w.project.ownerId]?.name;

  const pending = [
    w.isMentorView
      ? { label: "Revisiones pedidas", n: reviewsAsked, tab: stage.n >= 4 ? "decidir" : "orientar" }
      : { label: "Tarjetas por confirmar", n: pendingReview(w.items).length, tab: "diagnostico" },
    { label: "Preguntas abiertas", n: openQuestions(w.items).length, tab: "diagnostico" },
    { label: "Hipótesis esperando aprobación", n: hypPending, tab: "validacion" },
    { label: "Tareas abiertas", n: w.tasks.filter((t) => t.status !== "done").length, tab: "validacion" },
  ];

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-4 gap-1.5 lg:hidden" aria-label="Avance por etapas">
        {STAGES.map((s) => {
          const state = stageState(s, w.phase);
          const done = phasesDone(s, w.phase);
          return (
            <li
              key={s.id}
              className={cx(
                "min-w-0 rounded-xl border px-2 py-2 sm:px-3 sm:py-2.5 shadow-2xs transition-colors",
                state === "current"
                  ? "border-blue-600 bg-blue-50/60"
                  : "border-slate-200/80 bg-white",
              )}
              aria-current={state === "current" ? "step" : undefined}
            >
              <p className="font-mono text-[0.625rem] text-slate-400">
                {s.n}
                <span className="hidden sm:inline"> · {state === "done" ? "hecha" : state === "current" ? "en curso" : "por venir"}</span>
              </p>
              <p className={cx("display mt-1 truncate text-base sm:text-xl font-bold", state === "done" ? "text-slate-400" : state === "upcoming" ? "text-slate-400" : "text-slate-900")}>{s.label}</p>
              <div className="mt-2 flex gap-[3px]" aria-hidden>
                {s.phases.map((p, i) => (
                  <span
                    key={p}
                    className={cx("h-[3px] flex-1 rounded", i < done ? "bg-emerald-600" : state === "current" && i === done ? "bg-blue-600" : "bg-slate-200")}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="sigue" className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-6 shadow-xs">
          <p id="sigue" className="eyebrow text-blue-700">
            Lo que sigue · {stage.label}
          </p>
          <p className="mt-3 text-xl font-bold leading-snug sm:text-2xl text-slate-900">{text}</p>
          <p className="mt-3 text-sm text-slate-600">{PHASE_LABEL[w.phase]}</p>
          <Link
            href={`/app/p/${id}/${tab}`}
            className="mt-5 inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-blue-700 shadow-xs"
          >
            {CTA[tab] ?? "Ir ahora"}
          </Link>
          <TurnLine turn={turn} viewerIsMentor={w.isMentorView} you={actor.name} mentor={mentorName} owner={ownerName} />
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <p className="eyebrow text-slate-500">Pendientes</p>
            <ul className="mt-3 space-y-2 text-sm">
              {pending.map((p) => (
                <li key={p.label}>
                  <Link href={`/app/p/${id}/${p.tab}`} className={cx("flex items-baseline gap-2 hover:text-blue-600 transition-colors", p.n ? "text-slate-800 font-medium" : "text-slate-400")}>
                    {p.label}
                    <span className={cx("ml-auto font-mono text-xs", p.n ? "text-blue-600 font-bold" : "text-slate-400")}>{p.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-sm shadow-xs">
            <p className="eyebrow text-slate-500">Archivo</p>
            <p className="mt-2 text-slate-500">Última actualización {formatDate(w.project.updatedAt)}.</p>
            <Link href={`/app/p/${id}/historial`} className="mt-2 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-blue-600 hover:underline">
              Ver evidencia e historial →
            </Link>
          </div>
          {w.permissions["project.delete"] && !w.isMentorView && (
            <div className="rounded-2xl border border-rose-200/80 bg-white p-6 shadow-xs">
              <p className="eyebrow text-rose-600">¿Lo creaste por error?</p>
              <div className="mt-3">
                <DeleteProject projectId={id} projectName={w.project.name} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TurnLine({ turn, viewerIsMentor, you, mentor, owner }: { turn: Turn; viewerIsMentor: boolean; you: string; mentor?: string; owner?: string }) {
  const mine = (turn === "mentor" && viewerIsMentor) || (turn === "entrepreneur" && !viewerIsMentor);
  const who =
    turn === "none"
      ? undefined
      : mine
        ? you
        : turn === "mentor"
          ? (mentor ?? "Mentor")
          : turn === "entrepreneur"
            ? (owner ?? "Emprendedor/a")
            : "Administración";
  const text =
    turn === "none"
      ? "Etapa concluida. Nadie tiene acciones pendientes."
      : mine
        ? "Ahora te toca a vos."
        : turn === "admin"
          ? "Esperando que la administración asigne mentor."
          : `Ahora le toca a ${who}.`;
  return (
    <p className="mt-5 flex items-center gap-3 text-sm text-slate-600">
      {who && (
        <span
          aria-hidden
          className={cx(
            "grid h-7 w-7 place-items-center rounded-full text-[0.625rem] font-bold text-white",
            turn === "mentor" ? "bg-blue-600" : turn === "admin" ? "bg-rose-600" : "bg-amber-600",
          )}
        >
          {who.slice(0, 2).toUpperCase()}
        </span>
      )}
      {text}
    </p>
  );
}
