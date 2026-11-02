import Link from "next/link";
import { cx, formatDate } from "@/shared/ui/primitives";
import type { MentorSession, MentorSessionKind, Project } from "@/types/domain";

const KIND_LABEL: Record<MentorSessionKind, string> = {
  first_review: "Primera revisión",
  second_review: "Segunda revisión",
  follow_up: "Seguimiento",
  exploratory: "Sesión exploratoria",
  evaluation: "Evaluación de ciclo",
};

/** Página del proyecto donde se trabaja la sesión (briefing, llamada, notas, síntesis y cierre). */
export function sessionHref(s: Pick<MentorSession, "projectId" | "kind">): string {
  return `/app/p/${s.projectId}/${s.kind === "second_review" || s.kind === "evaluation" ? "decidir" : "orientar"}`;
}

/**
 * Agenda de sesiones de mentoría de todos los proyectos. Es solo un índice: cada sesión se prepara,
 * se hace y se cierra dentro de su proyecto, para que haya un único lugar de trabajo.
 */
export function SessionsView({ sessions, projects }: { sessions: MentorSession[]; projects: Project[] }) {
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? "Proyecto";
  const when = (s: MentorSession) => s.scheduledAt ?? s.createdAt;
  const open = sessions.filter((s) => s.status !== "completed").sort((a, b) => when(a).localeCompare(when(b)));
  const done = sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => (b.completedAt ?? when(b)).localeCompare(a.completedAt ?? when(a)))
    .slice(0, 20);

  const row = (s: MentorSession) => (
    <li key={s.id}>
      <Link
        href={sessionHref(s)}
        className="flex flex-col gap-1 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs transition-colors hover:border-blue-300 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {KIND_LABEL[s.kind]} · {name(s.projectId)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {s.scheduledAt ? `📅 ${formatDate(s.scheduledAt)}` : "Sin fecha acordada"}
            {s.preSessionBriefing && s.status !== "completed" ? " · briefing listo" : ""}
            {s.postSessionSynthesis ? " · con síntesis" : ""}
          </p>
        </div>
        <span
          className={cx(
            "self-start rounded-full px-2.5 py-0.5 text-xs font-semibold sm:self-center",
            s.status === "completed" ? "bg-emerald-50 text-emerald-700" : s.status === "in_progress" ? "bg-cyan-50 text-cyan-700" : "bg-amber-50 text-amber-700",
          )}
        >
          {s.status === "completed" ? "Cerrada" : s.status === "in_progress" ? "En curso" : "Pendiente"}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sesiones de mentoría</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Tu agenda de todos los proyectos. Cada sesión se prepara, se hace y se cierra dentro de su proyecto: abrila para ver el briefing, entrar a la
          llamada y cerrar con el acuerdo o la decisión.
        </p>
      </div>
      <section aria-labelledby="ses-open" className="space-y-3">
        <h2 id="ses-open" className="eyebrow text-slate-500">
          Próximas y abiertas ({open.length})
        </h2>
        {open.length ? <ul className="space-y-2.5">{open.map(row)}</ul> : <p className="text-sm text-slate-500">No hay sesiones abiertas.</p>}
      </section>
      {done.length > 0 && (
        <section aria-labelledby="ses-done" className="space-y-3">
          <h2 id="ses-done" className="eyebrow text-slate-500">
            Cerradas recientemente
          </h2>
          <ul className="space-y-2.5">{done.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
