"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentArtifact, AgentDocumentPlacement } from "@/types/domain";
import { addAgentDocumentToProjectAction, documentTargetsAction } from "@/app/actions";

export const isDocumentArtifact = (a: AgentArtifact) => a.type === "application/vnd.rax.document";

/** Enlace de descarga de un documento del agente en el formato pedido (el archivo se arma al bajarlo). */
export function messageDocumentUrl(messageId: string, artifactId: string, format: "pdf" | "docx") {
  return `/api/documentos?mensaje=${encodeURIComponent(messageId)}&artefacto=${encodeURIComponent(artifactId)}&formato=${format}`;
}

/** Enlace de descarga de un documento del conocimiento del proyecto como PDF o Word. */
export function projectDocumentUrl(projectId: string, documentId: string, format: "pdf" | "docx") {
  return `/api/documentos?proyecto=${encodeURIComponent(projectId)}&documento=${encodeURIComponent(documentId)}&formato=${format}`;
}

function DownloadLink({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <a
      href={href}
      download
      onClick={(e) => e.stopPropagation()}
      className={
        primary
          ? "px-2.5 py-1.5 rounded-lg text-[0.6875rem] font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition"
          : "px-2.5 py-1.5 rounded-lg text-[0.6875rem] font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition"
      }
    >
      ↓ {label}
    </a>
  );
}

/** Botones PDF / Word; el formato que pidió la persona va primero. */
export function DocumentDownloads({ hrefFor, preferred = "pdf" }: { hrefFor: (f: "pdf" | "docx") => string; preferred?: "pdf" | "docx" }) {
  const order: Array<"pdf" | "docx"> = preferred === "docx" ? ["docx", "pdf"] : ["pdf", "docx"];
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {order.map((f, i) => (
        <DownloadLink key={f} href={hrefFor(f)} label={f === "pdf" ? "PDF" : "Word"} primary={i === 0} />
      ))}
    </div>
  );
}

type Target = { id: string; name: string; current: boolean; saved: boolean };

/**
 * «Agregar a un proyecto»: lista los proyectos donde la persona puede guardar el documento (para un
 * mentor, los que tiene asignados) y lo agrega al elegido. El servidor vuelve a verificar el permiso.
 */
function AddToProject({ messageId, artifactId, onSaved }: { messageId: string; artifactId: string; onSaved: (p: AgentDocumentPlacement) => void }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    setError(null);
    if (!next) return;
    setTargets(null);
    const res = await documentTargetsAction(messageId, artifactId);
    if (res.ok) setTargets(res.data ?? []);
    else setError(res.error);
  };

  const add = async (t: Target) => {
    setBusy(t.id);
    setError(null);
    const res = await addAgentDocumentToProjectAction(messageId, artifactId, t.id);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setTargets((prev) => prev?.map((x) => (x.id === t.id ? { ...x, saved: true } : x)) ?? prev);
    if (res.data) onSaved(res.data.placement);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="px-2.5 py-1.5 rounded-lg text-[0.6875rem] font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition"
      >
        + Agregar a un proyecto
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-64 max-w-[80vw] p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
          <p className="px-2 pt-1 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500">Guardar en los documentos de…</p>
          {!targets && !error && <p className="px-2 py-2 text-[0.6875rem] text-slate-500">Cargando proyectos…</p>}
          {targets?.length === 0 && <p className="px-2 py-2 text-[0.6875rem] text-slate-500">No tienes proyectos donde guardarlo.</p>}
          <ul className="max-h-60 overflow-y-auto">
            {targets?.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={t.saved || busy !== null}
                  onClick={() => add(t)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-slate-800 hover:bg-orange-50 disabled:hover:bg-transparent disabled:cursor-default transition"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.name}</span>
                    {t.current && <span className="block text-[0.625rem] text-slate-500">Proyecto de esta conversación</span>}
                  </span>
                  <span className="shrink-0 text-[0.625rem] font-semibold">
                    {t.saved ? <span className="text-emerald-700">✓ Agregado</span> : busy === t.id ? <span className="text-slate-500">Guardando…</span> : <span className="text-orange-700">Agregar</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {targets?.some((t) => !t.current) && (
            <p className="px-2 pt-1.5 text-[0.625rem] leading-snug text-slate-500">El documento se redactó con el contexto del proyecto de esta conversación; revisa que sirva antes de agregarlo a otro.</p>
          )}
          {error && <p className="px-2 py-1.5 text-[0.6875rem] text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Tarjeta de un documento generado por el agente dentro de un mensaje. */
export function DocumentCard({ artifact, messageId, onOpen }: { artifact: AgentArtifact; messageId: string; onOpen?: () => void }) {
  const sections = artifact.content.split("\n").filter((l) => /^##\s/.test(l)).length;
  const canDownload = !messageId.startsWith("err-") && !messageId.startsWith("tmp-");
  const [savedTo, setSavedTo] = useState<AgentDocumentPlacement[]>(artifact.savedTo ?? []);
  useEffect(() => setSavedTo(artifact.savedTo ?? []), [artifact.savedTo]);
  const names = savedTo.map((p) => p.projectName).filter(Boolean);
  if (artifact.documentId && !savedTo.some((p) => p.documentId === artifact.documentId)) names.unshift("este proyecto");
  const where = names.length ? ` · ✓ En los documentos de ${names.join(", ")}` : "";
  return (
    <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col @lg:flex-row @lg:items-center justify-between gap-2.5">
      <button type="button" onClick={onOpen} className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer" title="Ver el contenido">
        <span className="shrink-0 w-9 h-11 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-[0.5625rem] font-bold flex items-end justify-center pb-1.5">
          {artifact.format === "docx" ? "DOCX" : "PDF"}
        </span>
        <span className="min-w-0">
          <span className="block font-bold text-slate-900 text-xs truncate">{artifact.title}</span>
          <span className="block text-[0.625rem] text-slate-500">
            Documento{sections ? ` · ${sections} secciones` : ""}
            {where}
          </span>
        </span>
      </button>
      {canDownload && (
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <AddToProject
            messageId={messageId}
            artifactId={artifact.id}
            onSaved={(p) => setSavedTo((prev) => [...prev.filter((x) => x.projectId !== p.projectId), p])}
          />
          <DocumentDownloads hrefFor={(f) => messageDocumentUrl(messageId, artifact.id, f)} preferred={artifact.format} />
        </div>
      )}
    </div>
  );
}
