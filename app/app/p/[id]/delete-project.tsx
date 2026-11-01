"use client";

import { useState, useTransition } from "react";
import { deleteProjectAction } from "@/app/actions";

/**
 * Borrar un proyecto creado por error. Solo se muestra a la persona dueña; el servidor vuelve a
 * verificarlo. Para confirmar hay que escribir el nombre del proyecto.
 */
export function DeleteProject({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = typed.trim().replace(/\s+/g, " ").toLocaleLowerCase("es") === projectName.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-600 hover:text-rose-700 hover:underline"
      >
        Borrar proyecto
      </button>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!matches) return;
        setError(null);
        start(async () => {
          const res = await deleteProjectAction(projectId, typed);
          // Si sale bien, el servidor redirige al inicio.
          if (res && !res.ok) setError(res.error);
        });
      }}
    >
      <p className="text-sm text-slate-700">
        Vas a borrar <strong>{projectName}</strong>. Desaparece para ti, para tus colaboradores y para tu mentor, junto con su conversación,
        diagnóstico, tareas y sesiones. Úsalo si lo creaste por error.
      </p>
      <label className="block text-xs text-slate-500">
        Escribe el nombre del proyecto para confirmar
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          autoComplete="off"
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:outline-none"
          placeholder={projectName}
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!matches || pending}
          className="h-9 rounded-full bg-rose-600 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Borrando…" : "Borrar definitivamente"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="h-9 rounded-full border border-slate-300 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
