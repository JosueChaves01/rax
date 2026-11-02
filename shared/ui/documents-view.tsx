"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Tag, cx, formatDate } from "@/shared/ui/primitives";
import { RESOURCE_CATEGORY_LABEL } from "@/features/labels";
import type { MentorResource, ResourceCategory } from "@/types/domain";
import type { LibraryDocument } from "@/lib/services/project-knowledge";
import { ViewDocumentButton, documentKindLabel } from "@/shared/ui/document-viewer";
import { MarkdownView } from "@/shared/ui/markdown-view";

type Tab = "proyectos" | "biblioteca";

const SOURCE_LABEL: Record<LibraryDocument["source"], string> = {
  upload: "Compartido",
  chat_extracted: "Del asistente",
  note: "Transcripción",
};

const searchIn = (q: string, ...texts: string[]) => texts.some((t) => t.toLowerCase().includes(q));

/**
 * Biblioteca de documentos: los documentos reales de tus proyectos (lo que compartió el mentor, lo que
 * generó el asistente, las transcripciones) y la biblioteca metodológica. Todo se puede ver acá mismo o descargar en PDF o Word.
 */
export function DocumentsView({
  documents,
  resources,
  initialTab,
  initialResourceId,
}: {
  documents: LibraryDocument[];
  resources: MentorResource[];
  initialTab?: Tab;
  initialResourceId?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? (documents.length ? "proyectos" : "biblioteca"));
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documentos</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Los documentos de tus proyectos (lo que compartió tu mentor, lo que generó el asistente y las transcripciones) y la biblioteca de guías y
            plantillas. Todo se puede ver acá mismo o descargar en PDF o Word.
          </p>
        </div>
        <div role="tablist" className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {(
            [
              ["proyectos", `De mis proyectos (${documents.length})`],
              ["biblioteca", `Biblioteca (${resources.length})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(
                "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === k ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === "proyectos" ? "Buscar por título o proyecto…" : "Buscar guías, plantillas, métodos…"}
        aria-label="Buscar documentos"
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-96"
      />

      {tab === "proyectos" ? <ProjectDocuments documents={documents} q={q} /> : <Library resources={resources} q={q} initialId={initialResourceId} />}
    </div>
  );
}

function ProjectDocuments({ documents, q }: { documents: LibraryDocument[]; q: string }) {
  const projects = useMemo(() => [...new Map(documents.map((d) => [d.projectId, d.projectName])).entries()], [documents]);
  const [project, setProject] = useState("all");
  const [onlyMentor, setOnlyMentor] = useState(false);
  const shown = documents.filter(
    (d) => (project === "all" || d.projectId === project) && (!onlyMentor || d.fromMentor) && (!q || searchIn(q, d.title, d.projectName, d.authorName)),
  );

  if (!documents.length)
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-sm text-slate-500">
        Tus proyectos todavía no tienen documentos. Aparecen acá cuando tu mentor comparte uno, cuando guardás uno que generó el asistente o al terminar una
        llamada con transcripción.
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {projects.length > 1 && (
          <select
            aria-label="Proyecto"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700"
          >
            <option value="all">Todos los proyectos</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          aria-pressed={onlyMentor}
          onClick={() => setOnlyMentor((v) => !v)}
          className={cx(
            "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            onlyMentor ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600 hover:border-slate-400",
          )}
        >
          Solo del mentor ({documents.filter((d) => d.fromMentor).length})
        </button>
      </div>

      {shown.length ? (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white px-5 shadow-xs">
          {shown.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <ViewDocumentButton
                  docRef={{ proyecto: doc.projectId, documento: doc.id }}
                  title={doc.title}
                  className="block max-w-full cursor-pointer truncate text-left text-sm font-semibold text-slate-900 hover:text-blue-600"
                >
                  {doc.title}
                </ViewDocumentButton>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  {doc.fromMentor ? <Tag color="var(--color-cyan)">Del mentor</Tag> : <Tag>{SOURCE_LABEL[doc.source]}</Tag>}
                  <Tag>{documentKindLabel(doc.filename, doc.fileType)}</Tag>
                  <Link href={`/app/p/${doc.projectId}/documentos`} className="font-medium text-slate-700 hover:text-blue-600 hover:underline">
                    {doc.projectName}
                  </Link>
                  <span>
                    · {doc.authorName} · {formatDate(doc.updatedAt)}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs font-semibold">
                <ViewDocumentButton docRef={{ proyecto: doc.projectId, documento: doc.id }} title={doc.title} />
                <a href={`/api/documentos?proyecto=${doc.projectId}&documento=${doc.id}&formato=pdf`} className="text-blue-600 hover:underline">
                  PDF
                </a>
                <a href={`/api/documentos?proyecto=${doc.projectId}&documento=${doc.id}&formato=docx`} className="text-blue-600 hover:underline">
                  Word
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Ningún documento coincide con el filtro.</p>
      )}
    </div>
  );
}

function Library({ resources, q, initialId }: { resources: MentorResource[]; q: string; initialId?: string }) {
  const [category, setCategory] = useState<ResourceCategory | "all">("all");
  const [selectedId, setSelectedId] = useState(initialId ?? resources[0]?.id ?? "");
  const categories = [...new Set(resources.map((r) => r.category))];
  const shown = resources.filter((r) => (category === "all" || r.category === category) && (!q || searchIn(q, r.title, r.description, ...r.tags)));
  const selected = shown.find((r) => r.id === selectedId) ?? shown[0];

  if (!resources.length) return <p className="text-sm text-slate-500">La biblioteca todavía no tiene recursos.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(["all", ...categories] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cx(
              "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              category === c ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600 hover:border-slate-400",
            )}
          >
            {c === "all" ? "Todos" : RESOURCE_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                aria-current={selected?.id === r.id ? "true" : undefined}
                className={cx(
                  "w-full cursor-pointer rounded-xl border bg-white p-4 text-left shadow-2xs transition-colors",
                  selected?.id === r.id ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200/80 hover:border-slate-300",
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.description}</p>
                <div className="mt-2">
                  <Tag color="var(--color-cyan)">{RESOURCE_CATEGORY_LABEL[r.category]}</Tag>
                </div>
              </button>
            </li>
          ))}
          {!shown.length && <li className="text-sm text-slate-500">Ningún recurso coincide con la búsqueda.</li>}
        </ul>

        {selected && (
          <article className="h-fit space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 lg:sticky lg:top-20">
            <div>
              <Tag color="var(--color-cyan)">{RESOURCE_CATEGORY_LABEL[selected.category]}</Tag>
              <h2 className="mt-2 text-lg font-bold text-slate-900">{selected.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{selected.description}</p>
            </div>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50 p-4">
              <MarkdownView content={selected.content} className="text-xs" />
            </div>
            {selected.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.tags.map((t) => (
                  <Tag key={t}>#{t}</Tag>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <ViewDocumentButton
                docRef={{ recurso: selected.id }}
                title={selected.title}
                className="inline-flex h-9 cursor-pointer items-center rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50"
              >
                Ver
              </ViewDocumentButton>
              <a
                href={`/api/documentos?recurso=${selected.id}&formato=pdf`}
                className="inline-flex h-9 items-center rounded-full bg-blue-600 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-blue-700"
              >
                Descargar PDF
              </a>
              <a
                href={`/api/documentos?recurso=${selected.id}&formato=docx`}
                className="inline-flex h-9 items-center rounded-full border border-slate-300 bg-white px-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50"
              >
                Word
              </a>
              <Link href="/app/chat" className="ml-auto text-xs font-semibold text-blue-600 hover:underline">
                Adaptarlo a mi proyecto con el asistente →
              </Link>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
