"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/shared/ui/primitives";
import { DataTablesView, MarkdownView } from "@/shared/ui/markdown-view";

/** Qué documento abrir, con los mismos parámetros que /api/documentos. */
export type DocumentRef = { proyecto: string; documento: string } | { mensaje: string; artefacto: string } | { recurso: string };

export function documentQuery(ref: DocumentRef): string {
  return new URLSearchParams(ref as Record<string, string>).toString();
}

export const documentDownloadUrl = (ref: DocumentRef, format: "pdf" | "docx") => `/api/documentos?${documentQuery(ref)}&formato=${format}`;
/** El PDF para mostrarlo en el navegador en vez de descargarlo. */
export const documentPdfPreviewUrl = (ref: DocumentRef) => `/api/documentos?${documentQuery(ref)}&formato=pdf&ver=1`;

type Loaded = { title: string; subtitle: string | null; content: string; fileType: string; filename: string | null };

const KIND_FROM_FILENAME: Array<[RegExp, string]> = [
  [/\.xlsx?$/i, "Excel"],
  [/\.(csv|tsv)$/i, "CSV"],
  [/\.pdf$/i, "PDF"],
  [/\.docx?$/i, "Word"],
  [/\.(md|markdown)$/i, "Markdown"],
  [/\.json$/i, "JSON"],
  [/\.txt$/i, "Texto"],
];

/** Etiqueta corta del archivo de origen («Excel», «CSV», «PDF»…). */
export function documentKindLabel(filename: string | null | undefined, fileType?: string): string {
  const hit = filename ? KIND_FROM_FILENAME.find(([re]) => re.test(filename)) : undefined;
  if (hit) return hit[1];
  return fileType === "csv" ? "Tabla" : fileType === "json" ? "JSON" : "Documento";
}

/**
 * Visor de documentos dentro de la app. Muestra el contenido con formato (o, si viene de un Excel o
 * CSV, como tablas) y la vista del PDF tal cual se descarga. El contenido se pide al abrirlo.
 */
export function DocumentViewer({ docRef, title, onClose }: { docRef: DocumentRef; title: string; onClose: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"contenido" | "pdf">("contenido");
  const query = documentQuery(docRef);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch(`/api/documentos/contenido?${query}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as (Loaded & { error?: string }) | null;
        if (!alive) return;
        if (!res.ok || !json) setError(json?.error ?? "No se pudo abrir el documento.");
        else setData(json);
      })
      .catch(() => alive && setError("No se pudo abrir el documento. Revisa tu conexión."));
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const isTable = data?.fileType === "csv";
  const kind = data ? documentKindLabel(data.filename, data.fileType) : null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ver ${title}`}
        className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-xl sm:h-[min(90vh,900px)] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-slate-200"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500">
              {kind && <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700">{kind}</span>}
              {data?.filename && <span className="truncate normal-case tracking-normal">{data.filename}</span>}
            </p>
            <h2 className="mt-1 truncate text-base font-bold text-slate-900">{data?.title ?? title}</h2>
            {data?.subtitle && <p className="truncate text-xs text-slate-500">{data.subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div role="tablist" className="flex gap-1 border-b border-slate-100 px-3 sm:px-4">
          {(
            [
              ["contenido", isTable ? "Tabla" : "Contenido"],
              ["pdf", "Vista PDF"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(
                "cursor-pointer border-b-2 px-3 py-2 text-xs font-semibold transition-colors",
                tab === k ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50/60">
          {tab === "pdf" ? (
            <iframe title={`PDF de ${title}`} src={documentPdfPreviewUrl(docRef)} className="h-full min-h-[60vh] w-full border-0 bg-white" />
          ) : error ? (
            <p className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          ) : !data ? (
            <div className="space-y-3 p-6" aria-busy="true" aria-label="Cargando documento">
              {[80, 95, 70, 90, 60].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-slate-200" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <div className="m-3 rounded-xl border border-slate-200 bg-white p-4 sm:m-4 sm:p-6">
              {isTable ? (
                <DataTablesView content={data.content} title={data.title} />
              ) : data.fileType === "json" || data.fileType === "code" ? (
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-800">{data.content}</pre>
              ) : (
                <MarkdownView content={data.content} />
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <a href={documentDownloadUrl(docRef, "pdf")} download className="inline-flex h-8 items-center rounded-full bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700">
            ↓ PDF
          </a>
          <a href={documentDownloadUrl(docRef, "docx")} download className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            ↓ Word
          </a>
          {tab === "pdf" && (
            <a href={documentPdfPreviewUrl(docRef)} target="_blank" rel="noopener" className="ml-auto text-xs font-semibold text-blue-600 hover:underline">
              Abrir en otra pestaña ↗
            </a>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Botón «Ver» que abre el visor del documento. */
export function ViewDocumentButton({ docRef, title, className, children = "Ver" }: { docRef: DocumentRef; title: string; className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "cursor-pointer text-blue-600 hover:underline"}>
        {children}
      </button>
      {open && <DocumentViewer docRef={docRef} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
