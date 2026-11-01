"use client";

import type { AgentArtifact } from "@/types/domain";

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

/** Tarjeta de un documento generado por el agente dentro de un mensaje. */
export function DocumentCard({ artifact, messageId, onOpen }: { artifact: AgentArtifact; messageId: string; onOpen?: () => void }) {
  const sections = artifact.content.split("\n").filter((l) => /^##\s/.test(l)).length;
  const canDownload = !messageId.startsWith("err-") && !messageId.startsWith("tmp-");
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
            {artifact.documentId ? " · ✓ En los documentos del proyecto" : ""}
          </span>
        </span>
      </button>
      {canDownload && <DocumentDownloads hrefFor={(f) => messageDocumentUrl(messageId, artifact.id, f)} preferred={artifact.format} />}
    </div>
  );
}
