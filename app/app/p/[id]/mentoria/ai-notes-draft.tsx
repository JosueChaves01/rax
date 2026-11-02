"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SessionNoteKind } from "@/types/domain";
import { addNotesBatchAction, suggestSessionNotesAction } from "@/app/actions";
import { NOTE_KIND_LABEL } from "@/features/labels";
import { Button, Notice, inputClass } from "@/shared/ui/primitives";

type Draft = { key: number; kind: SessionNoteKind; body: string; relatedItemId: string; isPrivate: boolean; include: boolean };

/**
 * Notas con IA: el mentor pide un borrador a partir de la reunión (transcripción de la llamada) y del
 * contexto actual del proyecto, lo corrige y guarda solo las notas que quiere conservar.
 */
export function AiNotesDraft({ projectId, sessionId, items }: { projectId: string; sessionId: string; items: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [basedOn, setBasedOn] = useState<"transcript" | "context" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();

  const generate = () =>
    startGenerating(async () => {
      setError(null);
      setNotice(null);
      const res = await suggestSessionNotesAction(projectId, sessionId);
      if (!res.ok) {
        setError(res.error || "No se pudieron generar las notas.");
        return;
      }
      const notes = res.data?.notes ?? [];
      if (!notes.length) {
        setError("La IA no encontró notas nuevas para proponer.");
        return;
      }
      setBasedOn(res.data?.basedOn ?? null);
      setDrafts(notes.map((n, i) => ({ key: Date.now() + i, kind: n.kind, body: n.body, relatedItemId: n.relatedItemId ?? "", isPrivate: false, include: true })));
    });

  const update = (key: number, patch: Partial<Draft>) => setDrafts((ds) => ds?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? null);

  const selected = (drafts ?? []).filter((d) => d.include && d.body.trim());

  const save = () =>
    startSaving(async () => {
      setError(null);
      const res = await addNotesBatchAction(
        projectId,
        sessionId,
        selected.map((d) => ({ kind: d.kind, body: d.body.trim(), relatedItemId: d.relatedItemId || null, isPrivate: d.isPrivate })),
      );
      if (!res.ok) {
        setError(res.error || "No se pudieron guardar las notas.");
        return;
      }
      setNotice(selected.length === 1 ? "Se guardó 1 nota." : `Se guardaron ${selected.length} notas.`);
      setDrafts(null);
      setBasedOn(null);
      router.refresh();
    });

  const busy = generating || saving;

  return (
    <div className="space-y-4 rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-bold text-slate-900">✨ Notas con IA</p>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-600">
            Redacta un borrador de notas a partir de la reunión (la transcripción de la llamada, si la hubo) y del estado actual del proyecto. Nada se guarda
            hasta que lo revises.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          className="border-blue-300 font-semibold text-blue-800 hover:bg-blue-50/80"
          disabled={busy}
          onClick={generate}
        >
          {generating ? "Generando…" : drafts ? "Volver a generar" : "✨ Generar notas"}
        </Button>
      </div>

      {notice && !drafts && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {drafts && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-blue-900">
            {basedOn === "transcript"
              ? "Borrador desde la transcripción de la llamada y el contexto del proyecto. Edita, quita o marca como privadas las que quieras."
              : "No hay transcripción de llamada: son notas de preparación desde el contexto del proyecto. Edítalas antes de guardar."}
          </p>
          <ul className="space-y-2.5">
            {drafts.map((d) => (
              <li key={d.key} className={`space-y-2.5 rounded-xl border bg-white p-3.5 shadow-2xs ${d.include ? "border-slate-200/80" : "border-slate-200/60 opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <input type="checkbox" className="rounded accent-blue-600" checked={d.include} onChange={(e) => update(d.key, { include: e.target.checked })} />
                    Guardar
                  </label>
                  <select
                    aria-label="Categoría de la nota"
                    className={`${inputClass} h-8 w-auto py-0 text-xs`}
                    value={d.kind}
                    onChange={(e) => update(d.key, { kind: e.target.value as SessionNoteKind })}
                  >
                    {(Object.keys(NOTE_KIND_LABEL) as SessionNoteKind[]).map((k) => (
                      <option key={k} value={k}>
                        {NOTE_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sobre"
                    className={`${inputClass} h-8 w-auto max-w-[16rem] py-0 text-xs`}
                    value={d.relatedItemId}
                    onChange={(e) => update(d.key, { relatedItemId: e.target.value })}
                  >
                    <option value="">Todo el proyecto</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                  </select>
                  <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-medium text-purple-700">
                    <input type="checkbox" className="rounded accent-purple-600" checked={d.isPrivate} onChange={(e) => update(d.key, { isPrivate: e.target.checked })} />
                    🔒 Privada
                  </label>
                </div>
                <textarea
                  aria-label="Contenido de la nota"
                  rows={2}
                  maxLength={2000}
                  className={inputClass}
                  value={d.body}
                  onChange={(e) => update(d.key, { body: e.target.value })}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" type="button" disabled={busy || selected.length === 0} onClick={save}>
              {saving ? "Guardando…" : `Guardar ${selected.length} ${selected.length === 1 ? "nota" : "notas"}`}
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={busy}
              onClick={() => {
                setDrafts(null);
                setBasedOn(null);
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
