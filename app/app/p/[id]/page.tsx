import Link from "next/link";
import { PHASE_LABEL } from "@/features/labels";
import { STAGES, phasesDone, stageOf, stageState, type Turn } from "@/features/projects/stages";
import { openQuestions, pendingReview } from "@/features/diagnosis/rules";
import { cx, formatDate } from "@/shared/ui/primitives";
import { loadWorkspace } from "./data";
import { nextAction } from "./next-action";

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
              className={cx("min-w-0 rounded-xl border bg-panel px-2 py-2 sm:px-3 sm:py-2.5", state === "current" ? "border-accent" : "border-line")}
              aria-current={state === "current" ? "step" : undefined}
            >
              <p className="font-mono text-[0.625rem] text-faint">
                {s.n}
                <span className="hidden sm:inline"> · {state === "done" ? "hecha" : state === "current" ? "en curso" : "por venir"}</span>
              </p>
              <p className={cx("display mt-1 truncate text-base sm:text-xl", state === "done" ? "text-muted" : state === "upcoming" ? "text-faint" : "")}>{s.label}</p>
              <div className="mt-2 flex gap-[3px]" aria-hidden>
                {s.phases.map((p, i) => (
                  <span
                    key={p}
                    className={cx("h-[3px] flex-1 rounded", i < done ? "bg-ok" : state === "current" && i === done ? "bg-accent" : "bg-white/10")}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="sigue" className="rounded-2xl border border-accent/45 bg-accent/5 p-6">
          <p id="sigue" className="eyebrow text-accent">
            Lo que sigue · {stage.label}
          </p>
          <p className="mt-3 text-xl font-semibold leading-snug sm:text-2xl">{text}</p>
          <p className="mt-3 text-sm text-muted">{PHASE_LABEL[w.phase]}</p>
          <Link
            href={`/app/p/${id}/${tab}`}
            className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-accent-strong"
          >
            {CTA[tab] ?? "Ir ahora"}
          </Link>
          <TurnLine turn={turn} viewerIsMentor={w.isMentorView} you={actor.name} mentor={mentorName} owner={ownerName} />
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="eyebrow">Pendientes</p>
            <ul className="mt-3 space-y-2 text-sm">
              {pending.map((p) => (
                <li key={p.label}>
                  <Link href={`/app/p/${id}/${p.tab}`} className={cx("flex items-baseline gap-2 hover:text-ink", p.n ? "" : "text-faint")}>
                    {p.label}
                    <span className={cx("ml-auto font-mono text-xs", p.n ? "text-ink" : "")}>{p.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-5 text-sm">
            <p className="eyebrow">Archivo</p>
            <p className="mt-2 text-muted">Última actualización {formatDate(w.project.updatedAt)}.</p>
            <Link href={`/app/p/${id}/historial`} className="mt-2 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:text-accent-strong">
              Ver evidencia e historial →
            </Link>
          </div>
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
    <p className="mt-5 flex items-center gap-3 text-sm text-muted">
      {who && (
        <span
          aria-hidden
          className={cx(
            "grid h-7 w-7 place-items-center rounded-full text-[0.625rem] font-bold text-black",
            turn === "mentor" ? "bg-cyan" : turn === "admin" ? "bg-danger" : "bg-highlight",
          )}
        >
          {who.slice(0, 2).toUpperCase()}
        </span>
      )}
      {text}
    </p>
  );
}
