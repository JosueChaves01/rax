"use client";

import { useState } from "react";
import Link from "next/link";
import { addProjectDocumentAction, deleteProjectDocumentAction } from "@/app/actions";
import { Button, Field, Notice, Tag, cx, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import type { ProjectDocRow } from "./data";
import type { ProjectDocumentFileType } from "@/types/domain";
import { ACCEPTED_UPLOADS, uploadForText } from "@/lib/documents/uploads";
import { ViewDocumentButton, documentKindLabel } from "@/shared/ui/document-viewer";
import type { DocKind } from "@/types/b2b";
import { PublishControls, type PublicationState, type PublishAudience } from "./documentos/publish-controls";

/** Pivot B2B (solo el mentor del proyecto, con RAX_B2B_FLOW): estado de publicación de cada documento. */
export type DocumentsPublishing = PublishAudience & { documents: Record<string, PublicationState & { docKind: DocKind }> };

const SOURCE_LABEL: Record<ProjectDocRow["source"], string> = {
  upload: "Compartido",
  chat_extracted: "Del asistente",
  note: "Transcripción",
};

const download = (projectId: string, id: string, format: "pdf" | "docx") => `/api/documentos?proyecto=${projectId}&documento=${id}&formato=${format}`;

/**
 * Documentos del proyecto con descarga en PDF o Word. En modo `mentor` muestra solo lo que compartió
 * el mentor (lo que la persona emprendedora tiene que tener a mano en cada revisión).
 */
export function DocumentsPanel({
  projectId,
  docs,
  canShare,
  viewerIsMentor,
  only,
  title,
  subtitle,
  compact,
  publishing,
}: {
  projectId: string;
  docs: ProjectDocRow[];
  /** Con valor, cada documento muestra «Publicar al cliente» (o para quién está publicado). */
  publishing?: DocumentsPublishing;
  canShare: boolean;
  viewerIsMentor: boolean;
  /** "mentor": solo los documentos que compartió el mentor. */
  only?: "mentor";
  title: string;
  subtitle?: string;
  /** Lista corta con enlace a la página de documentos. */
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "mentor" | "team">(only === "mentor" ? "mentor" : "all");
  const [sharing, setSharing] = useState(false);
  const fromMentor = docs.filter((d) => d.fromMentor);
  const shown = filter === "mentor" ? fromMentor : filter === "team" ? docs.filter((d) => !d.fromMentor) : docs;
  const list = compact ? shown.slice(0, 5) : shown;

  return (
    <section aria-label={title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {canShare && !sharing && (
          <Button size="sm" onClick={() => setSharing(true)}>
            + Compartir documento
          </Button>
        )}
      </div>

      {!only && !compact && docs.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar documentos">
          {(
            [
              ["all", `Todos (${docs.length})`],
              ["mentor", `${viewerIsMentor ? "Compartidos por vos" : "Del mentor"} (${fromMentor.length})`],
              ["team", `Del equipo y del asistente (${docs.length - fromMentor.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={cx(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === k ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600 hover:border-slate-400",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {sharing && <ShareForm projectId={projectId} viewerIsMentor={viewerIsMentor} onDone={() => setSharing(false)} />}

      {list.length ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {list.map((doc) => (
            <DocRow key={doc.id} projectId={projectId} doc={doc} publishing={publishing} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
          {filter === "mentor"
            ? viewerIsMentor
              ? "Todavía no compartiste documentos en este proyecto. Podés subir uno acá o pedirle al asistente que agregue uno que generó."
              : "Tu mentor todavía no compartió documentos. Cuando lo haga, aparecen acá para descargarlos."
            : "El proyecto no tiene documentos todavía."}
        </p>
      )}

      {compact && (shown.length > list.length || docs.length > shown.length) && (
        <Link href={`/app/p/${projectId}/documentos`} className="mt-3 inline-block text-xs font-semibold text-blue-600 hover:underline">
          Ver todos los documentos ({docs.length}) →
        </Link>
      )}
    </section>
  );
}

function DocRow({ projectId, doc, publishing }: { projectId: string; doc: ProjectDocRow; publishing?: DocumentsPublishing }) {
  const publication = publishing?.documents[doc.id];
  const { run, pending, error } = useAction();
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <ViewDocumentButton
          docRef={{ proyecto: projectId, documento: doc.id }}
          title={doc.title}
          className="block max-w-full cursor-pointer truncate text-left text-sm font-semibold text-slate-900 hover:text-blue-600"
        >
          {doc.title}
        </ViewDocumentButton>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {doc.fromMentor ? <Tag color="var(--color-cyan)">Del mentor</Tag> : <Tag>{SOURCE_LABEL[doc.source]}</Tag>}
          <span>
            {documentKindLabel(doc.filename)} · {doc.authorName} · {formatDate(doc.updatedAt)}
          </span>
        </p>
        {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
        {publishing && publication && publication.docKind !== "intake" && (
          <div className="mt-2">
            <PublishControls documentId={doc.id} state={publication} audience={publishing} docKind={publication.docKind} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-semibold">
        <ViewDocumentButton docRef={{ proyecto: projectId, documento: doc.id }} title={doc.title} />
        <a href={download(projectId, doc.id, "pdf")} className="text-blue-600 hover:underline">
          PDF
        </a>
        <a href={download(projectId, doc.id, "docx")} className="text-blue-600 hover:underline">
          Word
        </a>
        {doc.canDelete &&
          (confirming ? (
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteProjectDocumentAction(projectId, doc.id))}
                className="cursor-pointer text-rose-600 hover:underline disabled:opacity-50"
              >
                {pending ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="cursor-pointer text-slate-500 hover:underline">
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="cursor-pointer text-slate-400 hover:text-rose-600">
              Eliminar
            </button>
          ))}
      </div>
    </li>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "documento";

/** Compartir un documento pegando el texto o subiendo un archivo (texto, PDF, Word, Excel o CSV). */
function ShareForm({ projectId, viewerIsMentor, onDone }: { projectId: string; viewerIsMentor: boolean; onDone: () => void }) {
  const { run, pending, error } = useAction();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [fileType, setFileType] = useState<ProjectDocumentFileType>("markdown");

  const readFile = async (file: File) => {
    setFileError(null);
    if (!/\.(md|markdown|txt)$/i.test(file.name)) {
      setReading(true);
      const res = await uploadForText(file);
      setReading(false);
      if (!res.ok) {
        setFileError(res.error);
        return;
      }
      setContent(res.extracted.content ?? "");
      setFileType(res.extracted.fileType);
      setFilename(file.name);
      if (!title) setTitle(res.extracted.title);
      return;
    }
    if (file.size > 900_000) {
      setFileError("El archivo es muy grande (máximo ~900 KB de texto).");
      return;
    }
    const text = await file.text();
    setContent(text);
    setFileType("markdown");
    setFilename(file.name);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  return (
    <form
      className="mt-4 space-y-3 rounded-xl border border-blue-200/80 bg-blue-50/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addProjectDocumentAction(projectId, { title: title.trim(), filename: filename || `${slug(title)}.md`, content, fileType }),
          onDone,
        );
      }}
    >
      <p className="text-xs text-slate-600">
        {viewerIsMentor
          ? "Lo que compartas queda en el proyecto: la persona emprendedora lo ve en su revisión y el asistente lo puede consultar."
          : "Queda en el proyecto: tu mentor lo ve y el asistente lo puede consultar."}
      </p>
      <Field id="doc-title" label="Título">
        <input id="doc-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </Field>
      <Field id="doc-content" label="Contenido" hint="Pegá el texto o subí un archivo: PDF, Word, Excel, CSV o texto.">
        <textarea id="doc-content" rows={6} className={inputClass} value={content} onChange={(e) => setContent(e.target.value)} required />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
          {reading ? "Leyendo el archivo…" : "Subir archivo"}
          <input type="file" accept={ACCEPTED_UPLOADS} disabled={reading} className="sr-only" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" type="button" onClick={onDone}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={pending || !title.trim() || !content.trim()}>
            {pending ? "Guardando..." : "Compartir"}
          </Button>
        </div>
      </div>
      {fileError && <Notice tone="warn">{fileError}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}
