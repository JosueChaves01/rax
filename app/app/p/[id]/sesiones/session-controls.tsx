"use client";

import { useState } from "react";
import type { SessionTopic } from "@/types/b2b";
import { confirmAttendanceAction, scheduleCycleSessionAction, updateSessionAgendaAction } from "@/app/actions/cycle";
import { Button, Notice, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { DISPLAY_UTC_OFFSET_HOURS } from "@/lib/dates";

/** Controles del ciclo B2B (inicio y /sesiones): asistencia del cliente, fecha y agenda del mentor. */

/** La persona cliente confirma que asistirá. */
export function ConfirmAttendanceButton({ projectId, sessionId, confirmed }: { projectId: string; sessionId: string; confirmed: boolean }) {
  const { run, pending, error } = useAction();
  if (confirmed) return <p className="text-xs font-medium text-emerald-700">Confirmaste tu asistencia.</p>;
  return (
    <div className="space-y-2">
      <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => confirmAttendanceAction(projectId, sessionId))}>
        {pending ? "Confirmando…" : "Confirmar asistencia"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** «AAAA-MM-DDTHH:MM» en la hora de la plataforma para el campo datetime-local. */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + DISPLAY_UTC_OFFSET_HOURS * 3_600_000);
  return d.toISOString().slice(0, 16);
}

/**
 * El mentor le pone (o cambia) la fecha a una sesión pendiente, o agenda una de seguimiento nueva.
 * Con `sessionId`, agenda esa sesión; sin él, crea la siguiente.
 */
export function ScheduleSessionForm({
  projectId,
  kind,
  sessionId,
  scheduledAt,
  label = "Agendar",
}: {
  projectId: string;
  kind: "kickoff" | "follow_up";
  sessionId?: string;
  scheduledAt?: string;
  label?: string;
}) {
  const { run, pending, error } = useAction();
  const [when, setWhen] = useState(toLocalInput(scheduledAt));
  const id = `when-${sessionId ?? kind}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => scheduleCycleSessionAction(projectId, { kind, scheduledAt: when, agenda: [], ...(sessionId ? { sessionId } : {}) }));
      }}
    >
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600">
        Fecha y hora (hora de Costa Rica)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={id} type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className={cx(inputClass, "w-auto")} />
        <Button type="submit" variant="primary" size="sm" disabled={pending || !when}>
          {pending ? "Guardando…" : label}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}

const STATUS_LABEL: Record<SessionTopic["status"], string> = { planned: "Por tratar", covered: "Cubierto", carried_over: "Pasa a la próxima" };

/** El mentor edita los temas de una sesión abierta: agregar, quitar y marcar como cubiertos. */
export function AgendaEditor({ projectId, sessionId, agenda }: { projectId: string; sessionId: string; agenda: SessionTopic[] }) {
  const { run, pending, error } = useAction();
  const [topics, setTopics] = useState<SessionTopic[]>(agenda);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const dirty = JSON.stringify(topics) !== JSON.stringify(agenda);
  const save = (next: SessionTopic[]) => run(() => updateSessionAgendaAction(projectId, sessionId, next));

  return (
    <div className="space-y-3">
      {topics.length === 0 ? (
        <p className="text-sm text-slate-500">Sin temas todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {topics.map((t, i) => (
            <li key={t.id || i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={`Marcar «${t.title}» como cubierto`}
                className="mt-1"
                checked={t.status === "covered"}
                onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, status: e.target.checked ? "covered" : "planned" } : x)))}
              />
              <span className="min-w-0 flex-1">
                <span className={cx("font-medium", t.status === "covered" ? "text-slate-400 line-through" : "text-slate-800")}>{t.title}</span>
                {t.goal && <span className="block text-xs text-slate-500">{t.goal}</span>}
              </span>
              <button type="button" className="text-xs text-slate-400 hover:text-rose-600" onClick={() => setTopics(topics.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input className={inputClass} placeholder="Tema nuevo" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título del tema" maxLength={200} />
        <input className={inputClass} placeholder="Para qué (opcional)" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Objetivo del tema" maxLength={500} />
        <Button
          type="button"
          size="sm"
          disabled={!title.trim()}
          onClick={() => {
            setTopics([...topics, { id: "", title: title.trim(), goal: goal.trim(), status: "planned" }]);
            setTitle("");
            setGoal("");
          }}
        >
          Agregar
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={pending || !dirty} onClick={() => save(topics)}>
          {pending ? "Guardando…" : "Guardar agenda"}
        </Button>
        {dirty && !pending && <span className="text-xs text-amber-700">Cambios sin guardar</span>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** Lista de temas de solo lectura, con su estado. */
export function AgendaList({ agenda }: { agenda: SessionTopic[] }) {
  if (!agenda.length) return <p className="text-sm text-slate-500">Sin temas todavía.</p>;
  return (
    <ul className="space-y-1.5">
      {agenda.map((t) => (
        <li key={t.id} className="text-sm">
          <span className={cx("font-medium", t.status === "covered" ? "text-slate-500" : "text-slate-800")}>{t.title}</span>
          <span className={cx("ml-2 text-[0.6875rem]", t.status === "covered" ? "text-emerald-700" : t.status === "carried_over" ? "text-amber-700" : "text-slate-400")}>
            {STATUS_LABEL[t.status]}
          </span>
          {t.goal && <span className="block text-xs text-slate-500">{t.goal}</span>}
        </li>
      ))}
    </ul>
  );
}
