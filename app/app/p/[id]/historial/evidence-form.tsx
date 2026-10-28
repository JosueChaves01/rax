"use client";

import { useState } from "react";
import type { EvidenceKind } from "@/types/domain";
import { addEvidenceAction } from "@/app/actions";
import { Button, Field, Notice, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv";

export function EvidenceForm({ projectId, idPrefix = "ev", onSaved }: { projectId: string; idPrefix?: string; onSaved?: () => void }) {
  const [kind, setKind] = useState<EvidenceKind>("note");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { run, pending, error } = useAction();

  return (
    <form
      className="grid gap-3 rounded-2xl border border-line bg-panel p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            addEvidenceAction(projectId, {
              kind,
              title,
              description,
              url: kind === "link" ? url : undefined,
              file: kind === "file" && file ? { name: file.name, mimeType: file.type, sizeBytes: file.size } : undefined,
            }),
          () => {
            setTitle("");
            setDescription("");
            setUrl("");
            setFile(null);
            onSaved?.();
          },
        );
      }}
    >
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Tipo de evidencia</legend>
        <div className="flex gap-2">
          {(["note", "link", "file"] as const).map((k) => (
            <label key={k} className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-white">
              <input type="radio" name={`${idPrefix}-kind`} className="sr-only" checked={kind === k} onChange={() => setKind(k)} />
              {k === "note" ? "Nota" : k === "link" ? "Enlace" : "Archivo"}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id={`${idPrefix}-title`} label="Título">
        <input id={`${idPrefix}-title`} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
      </Field>
      {kind === "link" && (
        <Field id={`${idPrefix}-url`} label="URL">
          <input id={`${idPrefix}-url`} type="url" className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://…" />
        </Field>
      )}
      {kind === "file" && (
        <Field id={`${idPrefix}-file`} label="Archivo" hint="PDF, imagen, texto o CSV, hasta 10 MB. En el prototipo se valida pero no se almacena.">
          <input id={`${idPrefix}-file`} type="file" accept={ACCEPT} className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-xs file:text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </Field>
      )}
      <div className="md:col-span-2">
        <Field id={`${idPrefix}-desc`} label="Qué muestra">
          <textarea id={`${idPrefix}-desc`} rows={2} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
      </div>
      <Button variant="primary" type="submit" disabled={pending}>Guardar evidencia</Button>
      {error && <div className="md:col-span-2"><Notice tone="error">{error}</Notice></div>}
    </form>
  );
}
