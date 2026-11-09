"use client";

import { useState } from "react";
import { commentOnResourceAction, listResourceCommentsAction } from "@/app/actions/client";
import type { ResourceComment } from "@/lib/services/client-portal";
import { Button, Notice, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

/**
 * Hilo de comentarios de un material publicado o de una sesión. Se carga al abrirlo. En un proyecto
 * grupal lo ve todo el grupo; en uno individual, la persona y su mentor.
 */
export function CommentsThread({
  projectId,
  target,
  count,
  label = "Comentarios",
}: {
  projectId: string;
  target: { type: "document" | "session"; id: string };
  /** Cuántos comentarios ve la persona (si se sabe antes de abrir el hilo). */
  count?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<ResourceComment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const { run, pending, error } = useAction();

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && comments === null) {
      const r = await listResourceCommentsAction(target);
      if (r.ok) setComments(r.data ?? []);
      else setLoadError(r.error);
    }
  };

  const shown = comments?.length ?? count;
  return (
    <div className="text-sm">
      <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" aria-expanded={open} onClick={toggle}>
        {label}
        {shown !== undefined ? ` (${shown})` : ""} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          {loadError && <Notice tone="error">{loadError}</Notice>}
          {comments === null && !loadError ? (
            <p className="text-xs text-slate-500">Cargando…</p>
          ) : (comments ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">Todavía no hay comentarios. Escribe el primero.</p>
          ) : (
            <ul className="space-y-2">
              {comments!.map((c) => (
                <li key={c.id} className={cx("rounded-lg px-3 py-2", c.authorRole === "mentor" ? "bg-blue-50" : "bg-white")}>
                  <p className="text-[0.6875rem] font-semibold text-slate-500">
                    {c.authorName}
                    {c.authorRole === "mentor" && !c.mine ? " · Mentor" : ""}
                  </p>
                  <p className="whitespace-pre-line text-slate-800">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => commentOnResourceAction(projectId, target, body),
                (r) => {
                  if (r.ok) setComments(r.data ?? []);
                  setBody("");
                },
              );
            }}
          >
            <textarea
              className={cx(inputClass, "min-h-16")}
              aria-label="Tu comentario"
              placeholder="Escribe una duda o comentario…"
              value={body}
              maxLength={2000}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button type="submit" size="sm" variant="primary" disabled={pending || !body.trim()}>
              {pending ? "Enviando…" : "Comentar"}
            </Button>
            {error && <Notice tone="error">{error}</Notice>}
          </form>
        </div>
      )}
    </div>
  );
}
