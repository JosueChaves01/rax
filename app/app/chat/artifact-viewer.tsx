"use client";

import { useState } from "react";
import type { AgentArtifact } from "@/types/domain";
import { DocumentDownloads, isDocumentArtifact, messageDocumentUrl } from "./document-card";
import { FormattedText } from "./formatted-text";

interface ArtifactViewerProps {
  artifact: AgentArtifact | null;
  /** Mensaje del que sale el artefacto: habilita la descarga en PDF/Word de los documentos. */
  messageId?: string;
  onClose: () => void;
  onSaveToKnowledge?: (artifact: AgentArtifact) => void;
}

export function ArtifactViewer({ artifact, messageId, onClose, onSaveToKnowledge }: ArtifactViewerProps) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  if (!artifact) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    let ext = "txt";
    if (artifact.type === "application/vnd.ant.react") ext = "tsx";
    else if (artifact.type === "text/html") ext = "html";
    else if (artifact.type === "image/svg+xml") ext = "svg";
    else if (artifact.type === "application/vnd.ant.mermaid") ext = "mmd";
    else if (artifact.type === "application/vnd.ant.markdown") ext = "md";

    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.identifier || "artefacto"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isDocument = isDocumentArtifact(artifact);
  const isVisual =
    isDocument ||
    artifact.type === "text/html" ||
    artifact.type === "application/vnd.ant.react" ||
    artifact.type === "image/svg+xml" ||
    artifact.type === "application/vnd.ant.mermaid" ||
    artifact.type === "application/vnd.ant.markdown";

  return (
    <div className="fixed inset-0 z-50 h-dvh w-full lg:static lg:z-auto lg:h-full lg:w-[480px] xl:w-[540px] shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden shadow-lg animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1 rounded-md bg-orange-100 text-orange-600 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-800 truncate">{artifact.title}</h3>
            <span className="text-[0.625rem] text-slate-400 font-mono">{artifact.identifier}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Action buttons */}
          <button
            onClick={handleCopy}
            title="Copiar código"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg text-xs flex items-center gap-1 transition"
          >
            {copied ? (
              <span className="text-emerald-600 font-bold text-[0.6875rem]">¡Copiado!</span>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {isDocument && messageId && (
            <DocumentDownloads hrefFor={(f) => messageDocumentUrl(messageId, artifact.id, f)} preferred={artifact.format} />
          )}

          <button
            onClick={handleDownload}
            hidden={isDocument}
            title="Descargar archivo"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg text-xs transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {onSaveToKnowledge && !artifact.documentId && (
            <button
              onClick={() => onSaveToKnowledge(artifact)}
              title="Guardar en Conocimiento del Proyecto"
              className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg text-xs transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition ml-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      {isVisual && (
        <div className="flex border-b border-slate-100 px-3 bg-slate-50/40">
          <button
            onClick={() => setTab("preview")}
            className={`py-2 px-3 text-xs font-semibold border-b-2 transition ${
              tab === "preview"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Vista Previa
          </button>
          <button
            onClick={() => setTab("code")}
            className={`py-2 px-3 text-xs font-semibold border-b-2 transition ${
              tab === "code"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Código Fuente
          </button>
        </div>
      )}

      {/* Body Area */}
      <div className="flex-1 overflow-auto bg-slate-50/50">
        {tab === "preview" && isVisual ? (
          isDocument ? (
            <div className="p-6 bg-white m-4 rounded-xl border border-slate-200">
              <h1 className="text-base font-bold text-slate-900">{artifact.title}</h1>
              {artifact.subtitle && <p className="text-[0.6875rem] text-slate-500 mb-4">{artifact.subtitle}</p>}
              <FormattedText content={artifact.content} isUser={false} />
            </div>
          ) : artifact.type === "image/svg+xml" ? (
            <div
              className="p-6 flex items-center justify-center min-h-full"
              dangerouslySetInnerHTML={{ __html: artifact.content }}
            />
          ) : artifact.type === "application/vnd.ant.mermaid" ? (
            <div className="p-6 font-mono text-xs text-slate-700 bg-white m-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[0.6875rem] font-bold text-orange-600 uppercase mb-2">Diagrama Mermaid:</div>
              <pre className="whitespace-pre-wrap leading-relaxed">{artifact.content}</pre>
            </div>
          ) : artifact.type === "application/vnd.ant.markdown" ? (
            <div className="p-6 prose prose-slate prose-sm max-w-none bg-white m-4 rounded-xl border border-slate-200">
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{artifact.content}</pre>
            </div>
          ) : (
            // Sandboxed iframe para HTML / React
            <iframe
              title={artifact.title}
              srcDoc={artifact.content}
              sandbox="allow-scripts"
              className="w-full h-full border-0 bg-white"
            />
          )
        ) : (
          <div className="p-4 font-mono text-xs text-slate-800 bg-slate-900 text-slate-100 min-h-full overflow-x-auto">
            <pre className="leading-relaxed">{artifact.content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

