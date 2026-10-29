"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { MentorResource, ResourceCategory } from "@/types/domain";
import { RESOURCE_CATEGORY_LABEL } from "@/features/labels";
import { createResourceAction } from "@/app/actions";
import {
  Button,
  Card,
  Empty,
  Field,
  Heading,
  Notice,
  Tag,
  cx,
  formatDate,
  inputClass,
} from "@/shared/ui/primitives";

interface Props {
  initialResources: MentorResource[];
  isMentor: boolean;
}

export function ResourcesView({ initialResources, isMentor }: Props) {
  const [resources, setResources] = useState<MentorResource[]>(initialResources);
  const [selectedCategory, setSelectedCategory] = useState<ResourceCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeResourceModal, setActiveResourceModal] = useState<MentorResource | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Formulario nuevo recurso
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<ResourceCategory>("framework");
  const [newDescription, setNewDescription] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredResources = resources.filter((r) => {
    if (selectedCategory !== "all" && r.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const inTitle = r.title.toLowerCase().includes(q);
      const inDesc = r.description.toLowerCase().includes(q);
      const inTags = r.tags.some((t) => t.toLowerCase().includes(q));
      if (!inTitle && !inDesc && !inTags) return false;
    }
    return true;
  });

  const handleCopy = (res: MentorResource) => {
    navigator.clipboard.writeText(`${res.title}\n\n${res.description}\n\n${res.content}`);
    setCopiedId(res.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim() || !newContent.trim()) {
      setFormError("Por favor completá el título, descripción y contenido.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const tagsArray = newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await createResourceAction({
        title: newTitle.trim(),
        category: newCategory,
        description: newDescription.trim(),
        content: newContent.trim(),
        tags: tagsArray,
        isPublic,
      });

      if (res && !res.ok) {
        setFormError(res.error);
      } else if (res && res.ok && res.data) {
        setResources((prev) => [res.data as MentorResource, ...prev]);
        setShowCreateModal(false);
        setNewTitle("");
        setNewDescription("");
        setNewContent("");
        setNewTags("");
      }
    });
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Acompañamiento y herramientas</p>
          <Heading level={1} highlight="recursos reutilizables." className="mt-2">
            Biblioteca de
          </Heading>
          <p className="mt-1 text-sm text-muted">
            Frameworks, cuestionarios, plantillas y patrones de experimentos para compartir con tus emprendedores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMentor && (
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              + Agregar recurso
            </Button>
          )}
          <Link href="/app/mentor">
            <Button variant="secondary" size="sm">
              🎛️ Cartera
            </Button>
          </Link>
          <Link href="/app">
            <Button variant="ghost" size="sm">
              ← Inicio
            </Button>
          </Link>
        </div>
      </div>

      {/* Barra de Filtros */}
      <section aria-label="Filtros" className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              selectedCategory === "all" ? "bg-accent text-white" : "border border-line bg-panel text-muted hover:text-ink",
            )}
          >
            Todos ({resources.length})
          </button>
          {(Object.keys(RESOURCE_CATEGORY_LABEL) as ResourceCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                selectedCategory === cat ? "bg-accent text-white" : "border border-line bg-panel text-muted hover:text-ink",
              )}
            >
              {RESOURCE_CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="search"
            placeholder="Buscar por título, tag o concepto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      {/* Grid de Recursos */}
      <section aria-label="Catálogo" className="mt-8">
        {filteredResources.length === 0 ? (
          <Empty title="Sin recursos coincidentes">
            No se encontraron plantillas o guías con los filtros seleccionados.
          </Empty>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredResources.map((res) => (
              <Card key={res.id} className="p-5 flex flex-col justify-between transition-colors hover:border-line-strong">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <Tag color="var(--color-cyan)">{RESOURCE_CATEGORY_LABEL[res.category]}</Tag>
                    <span className="font-mono text-[0.6875rem] text-faint">{formatDate(res.createdAt)}</span>
                  </div>

                  <h3 className="mt-3 text-lg font-semibold text-ink">{res.title}</h3>
                  <p className="mt-1 text-xs text-muted line-clamp-3">{res.description}</p>

                  {res.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1">
                      {res.tags.map((tag) => (
                        <span key={tag} className="rounded bg-raised px-1.5 py-0.5 text-[0.6875rem] text-faint">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => setActiveResourceModal(res)}
                    className="text-xs font-semibold text-highlight hover:underline"
                  >
                    Ver plantilla completa →
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(res)}
                    title="Copiar texto de la plantilla"
                  >
                    {copiedId === res.id ? "✓ Copiado" : "Copiar"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Modal de visualización de contenido */}
      {activeResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line-strong bg-panel p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Tag color="var(--color-cyan)">
                  {RESOURCE_CATEGORY_LABEL[activeResourceModal.category]}
                </Tag>
                <h2 className="display mt-2 text-2xl text-ink">{activeResourceModal.title}</h2>
                <p className="mt-1 text-xs text-muted">{activeResourceModal.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveResourceModal(null)}
                className="text-muted hover:text-ink text-lg"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-line bg-bg p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed text-ink/90">
              {activeResourceModal.content}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCopy(activeResourceModal)}
              >
                {copiedId === activeResourceModal.id ? "✓ Copiado al portapapeles" : "Copiar contenido"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setActiveResourceModal(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para crear nuevo recurso */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line-strong bg-panel p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="display text-2xl">Agregar recurso</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-muted hover:text-ink text-lg"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4">
                <Notice tone="error">{formError}</Notice>
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <Field id="res-title" label="Título del recurso">
                <input
                  id="res-title"
                  className={inputClass}
                  placeholder="Ej. Matriz de Validación de Propuesta de Valor"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </Field>

              <Field id="res-category" label="Categoría">
                <select
                  id="res-category"
                  className={inputClass}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ResourceCategory)}
                >
                  {(Object.keys(RESOURCE_CATEGORY_LABEL) as ResourceCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {RESOURCE_CATEGORY_LABEL[cat]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field id="res-desc" label="Descripción sintética">
                <input
                  id="res-desc"
                  className={inputClass}
                  placeholder="¿Para qué sirve y en qué momento del acompañamiento conviene usarlo?"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  required
                />
              </Field>

              <Field id="res-tags" label="Etiquetas (separadas por coma)">
                <input
                  id="res-tags"
                  className={inputClass}
                  placeholder="ej. clientes, costos, ventas, validacion"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                />
              </Field>

              <Field id="res-content" label="Contenido estructurado (Markdown / Texto)">
                <textarea
                  id="res-content"
                  rows={8}
                  className={inputClass}
                  placeholder="Pegá aquí la estructura de preguntas, pasos o plantilla que utilizarán tus emprendedores..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  required
                />
              </Field>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="res-public"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded border-line-strong text-accent focus:ring-accent"
                />
                <label htmlFor="res-public" className="text-xs text-muted">
                  Hacer público para toda la plataforma (desmarcar para dejarlo privado en tu biblioteca)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isPending}>
                  {isPending ? "Guardando..." : "Guardar en biblioteca"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

