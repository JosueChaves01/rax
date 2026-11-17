"use client";

import { useRef, useState, useTransition } from "react";
import type { MentorDocumentKind } from "@/types/b2b";
import type { MentorDocumentSummary } from "@/lib/services/mentor-knowledge";
import {
  addMentorDocumentAction,
  deleteMentorDocumentAction,
  importMentorResourcesAction,
  listMentorDocumentsAction,
} from "@/app/actions/mentor";
import { Button, Card, Empty, Field, Notice, formatDate, inputClass } from "@/shared/ui/primitives";
import { KIND_CONFIG } from "../constants";

interface KnowledgeTabProps {
  initialDocuments: MentorDocumentSummary[];
  ownResources: number;
  onDocumentsUpdated?: (docs: MentorDocumentSummary[]) => void;
}

export function KnowledgeTab({ initialDocuments, ownResources, onDocumentsUpdated }: KnowledgeTabProps) {
  const [docs, setDocs] = useState<MentorDocumentSummary[]>(initialDocuments);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Formulario de agregar documento
  const [title, setTitle] = useState("");
  const [filename, setFilename] = useState("");
  const [fileType, setFileType] = useState("markdown");
  const [kind, setKind] = useState<MentorDocumentKind>("methodology");
  const [content, setContent] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Estados interactivos
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle("");
    setFilename("");
    setFileType("markdown");
    setContent("");
    setIsFormOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processFile = async (file: File | undefined) => {
    if (!file) return;
    setFlash(null);
    setReading(true);
    setIsFormOpen(true);

    try {
      const form = new FormData();
      form.append("archivo", file);
      const res = await fetch("/api/documentos/extraer", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        extracted?: { title: string; filename: string; content: string; fileType: string; detail?: string };
      };

      if (!res.ok || !body.extracted) {
        setFlash({ tone: "error", text: body.error ?? "No se pudo leer el archivo seleccionado." });
        return;
      }

      setTitle((t) => t || body.extracted!.title);
      setFilename(body.extracted.filename);
      setFileType(body.extracted.fileType);
      setContent(body.extracted.content);
      setFlash({
        tone: "success",
        text: `Archivo «${body.extracted.filename}» leído correctamente. Revisa el contenido y haz clic en «Guardar Documento».`,
      });
    } catch {
      setFlash({ tone: "error", text: "Error de conexión al procesar el archivo." });
    } finally {
      setReading(false);
    }
  };

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setFlash({ tone: "error", text: "El documento requiere un título." });
      return;
    }
    if (!content.trim()) {
      setFlash({ tone: "error", text: "El contenido no puede estar vacío." });
      return;
    }

    startTransition(async () => {
      const res = await addMentorDocumentAction({
        title: cleanTitle,
        filename:
          filename.trim() ||
          `${cleanTitle.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60) || "documento"}.md`,
        content,
        fileType,
        kind,
      });

      if (res.ok && res.data) {
        const updated = [res.data, ...docs];
        setDocs(updated);
        onDocumentsUpdated?.(updated);
        resetForm();
        setFlash({ tone: "success", text: "Documento indexado con éxito en tu conocimiento." });
      } else {
        setFlash({ tone: "error", text: res.ok ? "Error al guardar." : res.error });
      }
    });
  };

  const handleDelete = (id: string, docTitle: string) => {
    if (!window.confirm(`¿Borrar «${docTitle}»? El Asistente IA dejará de citarlo y utilizarlo con tus clientes.`)) {
      return;
    }
    setFlash(null);
    startTransition(async () => {
      const res = await deleteMentorDocumentAction(id);
      if (res.ok) {
        const updated = docs.filter((d) => d.id !== id);
        setDocs(updated);
        onDocumentsUpdated?.(updated);
        setFlash({ tone: "success", text: "Documento eliminado de tu biblioteca." });
      } else {
        setFlash({ tone: "error", text: res.error });
      }
    });
  };

  const handleImportResources = () => {
    setFlash(null);
    startTransition(async () => {
      const res = await importMentorResourcesAction();
      if (!res.ok) return setFlash({ tone: "error", text: res.error });
      const { imported = 0, skipped = 0 } = res.data ?? {};
      const fresh = await listMentorDocumentsAction();
      if (fresh.ok && fresh.data) {
        setDocs(fresh.data);
        onDocumentsUpdated?.(fresh.data);
      }
      setFlash({
        tone: "success",
        text: imported
          ? `Se importaron ${imported} recursos a tu conocimiento${skipped ? ` (${skipped} ya existían)` : ""}.`
          : "Todos tus recursos ya se encuentran indexados en tu conocimiento.",
      });
    });
  };

  const totalTokens = docs.reduce((sum, d) => sum + d.tokenCount, 0);

  const filteredDocs = docs.filter((doc) => {
    if (activeFilter === "all") return true;
    return doc.kind === activeFilter;
  });

  return (
    <div className="space-y-6">
      {/* Banner de Privacidad y Funcionamiento RAG */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                🔒
              </span>
              <h2 className="text-base font-bold text-slate-900">Base de Conocimiento Privada (RAG)</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
              Tus documentos nunca son descargados ni leídos directamente por tus clientes. El Asistente IA los fragmenta e indexa
              de forma semántica para citar tus marcos de trabajo, plantillas y casos de éxito en el momento exacto que el cliente lo necesita.
            </p>
          </div>

          {ownResources > 0 && (
            <button
              type="button"
              onClick={handleImportResources}
              disabled={pending}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 transition disabled:opacity-50"
            >
              📥 Traer mis recursos ({ownResources})
            </button>
          )}
        </div>

        {/* Medidor de Tokens y RAG */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700">
              Total indexado: ~{totalTokens.toLocaleString("es")} tokens en {docs.length} documentos
            </span>
            <span className="text-slate-500 font-mono text-[11px]">
              {totalTokens <= 6000 ? "Modo In-Context Directo" : "Modo Búsqueda Semántica RAG"}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all duration-500 ${
                totalTokens > 6000 ? "bg-indigo-600" : "bg-blue-600"
              }`}
              style={{ width: `${Math.min(100, (totalTokens / 20000) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Zona Drag & Drop y Formulario de Subida */}
      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Subir o Agregar Documento</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Arrastra archivos PDF, Word, Excel, CSV o Markdown (hasta 10 MB). Se extraerá el texto automáticamente.
            </p>
          </div>

          <Button
            size="sm"
            variant={isFormOpen ? "secondary" : "primary"}
            onClick={() => setIsFormOpen(!isFormOpen)}
          >
            {isFormOpen ? "Ocultar formulario" : "+ Agregar documento manual"}
          </Button>
        </div>

        {/* Dropzone Visual */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            processFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-all ${
            isDragOver
              ? "border-blue-600 bg-blue-50/60 scale-[1.01]"
              : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.csv,.md,.markdown,.txt,.json"
            className="hidden"
            onChange={(e) => processFile(e.target.files?.[0])}
          />

          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <p className="mt-3 text-sm font-semibold text-slate-800">
            {reading ? "Extrayendo contenido del archivo…" : "Haz clic para subir o arrastra un archivo aquí"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Compatible con PDF, DOCX, XLSX, CSV, Markdown y Texto plano (máx. 10 MB)
          </p>
        </div>

        {/* Formulario Expandible */}
        {isFormOpen && (
          <form onSubmit={handleAddDocument} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-5">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <Field label="Título del Documento" id="md-title">
                <input
                  id="md-title"
                  className={inputClass}
                  maxLength={200}
                  placeholder="Ej: Metodología de Validación en 5 Pasos"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>

              <Field label="Categoría de Contenido" id="md-kind">
                <select
                  id="md-kind"
                  className={inputClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as MentorDocumentKind)}
                >
                  {(Object.keys(KIND_CONFIG) as MentorDocumentKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_CONFIG[k].label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Contenido en Texto / Markdown"
              id="md-content"
              hint="El texto que el asistente leerá y citará. Puedes editar libremente el texto extraído del archivo o pegar tus notas."
            >
              <textarea
                id="md-content"
                className={inputClass}
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Pega aquí el contenido de tu documento o framework..."
              />
            </Field>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>

              <Button
                type="submit"
                variant="primary"
                disabled={pending || reading || !title.trim() || !content.trim()}
              >
                {pending ? "Indexando…" : "Indexar en Conocimiento"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Lista de Documentos Indexados */}
      <Card className="p-6 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Documentos Indexados ({docs.length})</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Biblioteca activa disponible para el Asistente IA en tus proyectos de mentoría.
            </p>
          </div>

          {/* Filtros por Categoría */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                activeFilter === "all" ? "bg-white text-slate-900 shadow-2xs font-semibold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Todos ({docs.length})
            </button>
            {(Object.keys(KIND_CONFIG) as MentorDocumentKind[]).map((k) => {
              const count = docs.filter((d) => d.kind === k).length;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveFilter(k)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                    activeFilter === k ? "bg-white text-slate-900 shadow-2xs font-semibold" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {KIND_CONFIG[k].label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="py-10 text-center">
            <Empty title="No hay documentos en esta sección">
              {docs.length === 0
                ? "Sube tu primer documento arrastrándolo en la zona superior para alimentar a tu Asistente IA."
                : "No hay documentos bajo el filtro seleccionado."}
            </Empty>
          </div>
        ) : (
          <div className="mt-5 divide-y divide-slate-100">
            {filteredDocs.map((doc) => {
              const config = KIND_CONFIG[doc.kind] || KIND_CONFIG.methodology;
              return (
                <div key={doc.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between group">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${config.badgeColor}`}>
                        {config.label}
                      </span>
                      <h4 className="truncate font-semibold text-sm text-slate-900">{doc.title}</h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="font-mono text-[11px] text-slate-600">{doc.filename}</span>
                      <span>•</span>
                      <span>~{doc.tokenCount.toLocaleString("es")} tokens</span>
                      <span>•</span>
                      <span>Actualizado: {formatDate(doc.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id, doc.title)}
                      disabled={pending}
                      className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Alertas flotantes */}
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
    </div>
  );
}
