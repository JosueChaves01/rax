"use client";

import { useState } from "react";
import { assignMentorAction, revokeMentorAction } from "@/app/actions";
import { Button, Notice, formatDate } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

export function AssignmentControls({ projectId, mentors, active, suggested }: { projectId: string; mentors: Array<{ id: string; name: string; full?: boolean }>; active: Array<{ id: string; mentorId: string; mentorName: string; since: string }>; suggested?: string }) {
  const available = mentors.filter((m) => !active.some((a) => a.mentorId === m.id));
  const suggestion = active.length === 0 ? available.find((m) => m.id === suggested) : undefined;
  const [mentor, setMentor] = useState(suggestion?.id ?? available.find((m) => !m.full)?.id ?? available[0]?.id ?? "");
  const { run, pending, error } = useAction();
  return (
    <div className="mt-3 space-y-2">
      {active.length === 0 ? (
        <p className="text-sm text-muted">Sin mentor asignado.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {active.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3">
              <span>{a.mentorName}</span>
              <span className="text-xs text-faint">desde {formatDate(a.since)}</span>
              <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => revokeMentorAction(a.id))}>Revocar</Button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => assignMentorAction(projectId, mentor)); }}>
          <label htmlFor={`m-${projectId}`} className="sr-only">Mentor</label>
          <select id={`m-${projectId}`} className="min-w-0 max-w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-sm text-ink focus:border-highlight focus:outline-none" value={mentor} onChange={(e) => setMentor(e.target.value)}>
            {available.map((m) => <option key={m.id} value={m.id}>{m.full ? `${m.name} (sin cupo)` : m.name}</option>)}
          </select>
          <Button size="sm" type="submit" disabled={pending || !mentor}>Asignar</Button>
        </form>
      )}
      {suggestion && <p className="text-xs text-muted">Sugerido: <span className="text-cyan">{suggestion.name.split(" · ")[0]}</span>, por rubro y cupo libre.</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
