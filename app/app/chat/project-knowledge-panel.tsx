"use client";

import { useEffect, useState, useCallback } from "react";
import { projectDocumentUrl } from "./document-card";
import type { ProjectDocumentFileType, ProjectKnowledgeDocument } from "@/types/domain";
import {
  addProjectDocumentAction,
  deleteProjectDocumentAction,
  getProjectKnowledgeStatsAction,
  listProjectDocumentsAction,
} from "@/app/actions";

interface ProjectKnowledgePanelProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onKnowledgeUpdated?: () => void;
}

export function ProjectKnowledgePanel({
  projectId,
  projectName,
  isOpen,
  onClose,
  onKnowledgeUpdated,
}: ProjectKnowledgePanelProps) {
  const [documents, setDocuments] = useState<ProjectKnowledgeDocument[]>([]);
  const [stats, setStats] = useState<{
    totalTokens: number;
    evaluation: { mode: "in_context" | "rag"; percentOfLimit: number; threshold: number };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [fileType, setFileType] = useState<ProjectDocumentFileType>("markdown");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const [docsRes, statsRes] = await Promise.all([
        listProjectDocumentsAction(projectId),
        getProjectKnowledgeStatsAction(projectId),
      ]);
      if (docsRes.ok && docsRes.data) setDocuments(docsRes.data);
      if (statsRes.ok && statsRes.data) setStats(statsRes.data);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") setFileType("csv");
    else if (ext === "json") setFileType("json");
    else if (ext === "py" || ext === "js" || ext === "ts" || ext === "tsx") setFileType("code");
    else if (ext === "txt") setFileType("text");
    else setFileType("markdown");

    const reader = new FileReader();
    reader.onload = (event) => {
      setContent(String(event.target?.result ?? ""));
    };
    reader.readAsText(file);
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !filename.trim() || !content.trim()) {
      setError("Por favor completa el título, nombre de archivo y contenido.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await addProjectDocumentAction(projectId, {
        title: title.trim(),
        filename: filename.trim(),
        content: content.trim(),
        fileType,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setTitle("");
      setFilename("");
      setContent("");
      setIsAdding(false);
      await loadData();
      onKnowledgeUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar documento");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("¿Deseas eliminar este documento de la base de conocimiento?")) return;
    const res = await deleteProjectDocumentAction(projectId, docId);
    if (res.ok) {
      await loadData();
      onKnowledgeUpdated?.();
    }
  };

  const isInContext = stats?.evaluation.mode !== "rag";
  const percent = stats?.evaluation.percentOfLimit ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </span>
              <h2 className="text-base font-bold text-slate-800">Conocimiento del Proyecto (Project Knowledge)</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Base compartida de documentos para: <strong className="text-slate-700">{projectName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Status Bar / Memory Strategy */}
          <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                Estrategia de Memoria Activa:
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.6875rem] font-bold ${
                    isInContext
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300/40"
                      : "bg-purple-100 text-purple-800 border border-purple-300/40"
                  }`}
                >
                  {isInContext ? "Carga Directa In-Context + Prompt Caching" : "Modo RAG Automático"}
                </span>
              </span>
              <span className="text-xs font-mono text-slate-500">
                {(stats?.totalTokens ?? 0).toLocaleString()} / {(stats?.evaluation.threshold ?? 80000).toLocaleString()} tokens
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  percent > 90 ? "bg-amber-500" : isInContext ? "bg-emerald-500" : "bg-purple-500"
                }`}
                style={{ width: `${Math.max(percent, 2)}%` }}
              />
            </div>

            <p className="text-[0.72rem] text-slate-500 leading-relaxed">
              {isInContext
                ? "Todos los archivos caben en la ventana de contexto. Claude los carga completos en su memoria con Prompt Caching para respuesta instantánea y sin pérdida de fidelidad."
                : "Se superó el umbral de contexto. Claude activó automáticamente el motor RAG, indexando los documentos en fragmentos y recuperando únicamente los pasajes relevantes."}
            </p>
          </div>

          {/* Action button */}
          {!isAdding && (
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Documentos ({documents.length})
              </h3>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar Documento
              </button>
            </div>
          )}

          {/* Add Form */}
          {isAdding && (
            <form onSubmit={handleAddDocument} className="p-4 bg-orange-50/30 rounded-xl border border-orange-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800">Nuevo Documento de Conocimiento</h4>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.7rem] font-semibold text-slate-600 mb-1">Título:</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej. Plan de Validación"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[0.7rem] font-semibold text-slate-600 mb-1">Nombre de archivo:</label>
                  <input
                    type="text"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="plan_validacion.md"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[0.7rem] font-semibold text-slate-600 mb-1">O sube un archivo:</label>
                <input
                  type="file"
                  accept=".md,.txt,.csv,.json,.py,.ts,.tsx,.js"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[0.7rem] font-semibold text-slate-600 mb-1">Contenido:</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Pega o redacta aquí el contenido del documento..."
                  rows={5}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white font-mono"
                />
              </div>

              {error && <div className="text-xs text-red-600 font-medium">{error}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg shadow-xs"
                >
                  {isSaving ? "Guardando..." : "Subir a Conocimiento"}
                </button>
              </div>
            </form>
          )}

          {/* Documents List */}
          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">Cargando base de conocimientos...</div>
          ) : documents.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl space-y-1">
              <p className="text-xs font-semibold text-slate-600">No hay documentos en este proyecto</p>
              <p className="text-[0.72rem] text-slate-400">
                Sube notas, manuales, transcripciones o guarda decisiones tomadas en los chats.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {documents.map((doc) => (
                <div key={doc.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-2 rounded-lg bg-slate-100 text-slate-600 shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-slate-800 truncate">{doc.title}</p>
                        <span className="text-[0.625rem] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-mono">
                          {doc.filename}
                        </span>
                        {doc.source === "chat_extracted" && (
                          <span className="text-[0.625rem] px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-700 border border-amber-200">
                            De Chat
                          </span>
                        )}
                      </div>
                      <p className="text-[0.6875rem] text-slate-400 mt-0.5">
                        ~{doc.tokenCount.toLocaleString()} tokens · {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                  {(["pdf", "docx"] as const).map((f) => (
                    <a
                      key={f}
                      href={projectDocumentUrl(projectId, doc.id, f)}
                      download
                      title={`Descargar como ${f === "pdf" ? "PDF" : "Word"}`}
                      className="px-1.5 py-1 text-[0.625rem] font-semibold text-slate-500 hover:text-orange-700 hover:bg-orange-50 rounded-md transition"
                    >
                      ↓ {f === "pdf" ? "PDF" : "Word"}
                    </a>
                  ))}
                  <button
                    onClick={() => handleDelete(doc.id)}
                    title="Eliminar documento"
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Los documentos son compartidos entre todos los chats de este proyecto.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
