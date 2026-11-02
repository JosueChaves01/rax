"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/shared/ui/primitives";
import { getAgentToolboxAction } from "@/app/actions";
import {
  TOOL_CATEGORIES,
  catalogFor,
  missingFields,
  type ToolCatalogEntry,
  type ToolField,
  type ToolPicker,
  type ToolRequirement,
  type ToolboxRole,
} from "@/lib/ai/tool-catalog";

type Toolbox = {
  role: ToolboxRole;
  webSearch: boolean;
  documents: Array<{ id: string; title: string; filename: string; fileType: string }>;
  mentorSessions: Array<{ id: string; label: string; open: boolean; mine: boolean; confirmed: boolean }>;
  targetProjects: Array<{ id: string; name: string }>;
};

export interface ToolUse {
  entry: ToolCatalogEntry;
  prompt: string;
  /** send: se envía ya; edit: queda en el cuadro de texto para revisarlo. */
  mode: "send" | "edit";
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  /** Documentos que el agente ya generó en este hilo (para guardarlos en un proyecto). */
  threadDocuments: Array<{ id: string; title: string }>;
  /** Otros hilos de la sesión abierta. */
  siblingThreads: Array<{ id: string; title: string }>;
  /** La sesión es real (no la «Sesión general» virtual): habilita las notas de la sesión. */
  sessionToolsEnabled: boolean;
  disabled?: boolean;
  onUse: (use: ToolUse) => void;
}

const isTable = (d: { filename: string; fileType: string }) => d.fileType === "csv" || /\.(xlsx|xls|csv|tsv)$/i.test(d.filename);

/** Motivo por el que una herramienta no se puede usar ahora (o null si se puede). */
function blocker(entry: ToolCatalogEntry, box: Toolbox, props: Props): string | null {
  if (entry.category === "session" && !props.sessionToolsEnabled) return "Disponible cuando el proyecto tiene sesiones del asistente.";
  const why: Record<ToolRequirement, () => string | null> = {
    web_search: () => (box.webSearch ? null : "La búsqueda web no está configurada en este despliegue."),
    document: () => (box.documents.length ? null : "El proyecto todavía no tiene documentos. Adjunta uno con 📎."),
    table: () => (box.documents.some(isTable) ? null : "Sube un Excel o CSV con 📎 para usarla."),
    thread_document: () => (props.threadDocuments.length ? null : "Primero genera un documento en este hilo."),
    sibling_thread: () => (props.siblingThreads.length ? null : "Esta sesión solo tiene este hilo."),
    mentor_session: () => (box.mentorSessions.length ? null : "El proyecto todavía no tiene sesiones de mentoría."),
    open_mentor_session: () => (box.mentorSessions.some((s) => s.open && (s.mine || box.role === "admin")) ? null : "No tienes sesiones de mentoría abiertas en este proyecto."),
    unconfirmed_mentor_session: () => (box.mentorSessions.some((s) => s.open && !s.confirmed) ? null : "No hay revisiones pendientes de confirmar."),
  };
  for (const r of entry.requires ?? []) {
    const reason = why[r]();
    if (reason) return reason;
  }
  return null;
}

function pickerOptions(picker: ToolPicker, box: Toolbox, props: Props): Array<{ value: string; label: string }> {
  switch (picker) {
    case "document":
      return box.documents.map((d) => ({ value: d.id, label: d.title || d.filename }));
    case "table":
      return box.documents.filter(isTable).map((d) => ({ value: d.id, label: d.title || d.filename }));
    case "mentor_session":
      return box.mentorSessions.map((s) => ({ value: s.id, label: s.label }));
    case "open_mentor_session":
      return box.mentorSessions.filter((s) => s.open && (s.mine || box.role === "admin")).map((s) => ({ value: s.id, label: s.label }));
    case "unconfirmed_mentor_session":
      return box.mentorSessions.filter((s) => s.open && !s.confirmed).map((s) => ({ value: s.id, label: s.label }));
    case "project":
      return box.targetProjects.map((p) => ({ value: p.id, label: p.id === props.projectId ? `${p.name} (este proyecto)` : p.name }));
    case "thread_document":
      return props.threadDocuments.map((d) => ({ value: d.id, label: d.title }));
    case "sibling_thread":
      return props.siblingThreads.map((t) => ({ value: t.id, label: t.title }));
  }
}

const inputCls =
  "block w-full px-3 py-2 text-base sm:text-xs text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 placeholder:text-slate-400";

export function AgentToolsPanel(props: Props) {
  const { open, onClose, projectId, projectName, onUse, disabled } = props;
  const [box, setBox] = useState<Toolbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | (typeof TOOL_CATEGORIES)[number]["id"]>("all");
  const [selected, setSelected] = useState<ToolCatalogEntry | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const firstFieldRef = useRef<HTMLElement | null>(null);

  // Cargar (o recargar al cambiar de proyecto) lo que hace falta para los formularios.
  useEffect(() => {
    if (!open || loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    setBox(null);
    setError(null);
    getAgentToolboxAction(projectId).then((res) => {
      if (res.ok && res.data) setBox(res.data as Toolbox);
      else {
        setError(!res.ok ? res.error : "No se pudieron cargar las herramientas.");
        loadedFor.current = null;
      }
    });
  }, [open, projectId]);

  // Cerrar con Escape (primero vuelve a la lista).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) setSelected(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, onClose]);

  useEffect(() => {
    if (selected) requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [selected]);

  const entries = useMemo(() => (box ? catalogFor(box.role) : []), [box]);
  const visible = useMemo(() => {
    const q = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return entries.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      const hay = `${e.title} ${e.description} ${e.tools.join(" ")}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query, category]);

  if (!open) return null;

  const choose = (entry: ToolCatalogEntry) => {
    const initial: Record<string, string> = {};
    for (const f of entry.fields) {
      if (f.kind === "select") initial[f.key] = f.options[0]?.value ?? "";
      if (f.kind === "picker" && f.required && box) {
        const opts = pickerOptions(f.picker, box, props);
        if (f.picker === "project") initial[f.key] = opts.find((o) => o.value === projectId)?.value ?? opts[0]?.value ?? "";
        else if (opts.length === 1) initial[f.key] = opts[0].value;
      }
    }
    setValues(initial);
    setTouched(false);
    setSelected(entry);
  };

  const labelsFor = (entry: ToolCatalogEntry): Record<string, string> => {
    const labels: Record<string, string> = {};
    if (!box) return labels;
    for (const f of entry.fields) {
      if (f.kind !== "picker" || !values[f.key]) continue;
      const opt = pickerOptions(f.picker, box, props).find((o) => o.value === values[f.key]);
      if (opt) labels[f.key] = opt.label.replace(/ \(este proyecto\)$/, "");
    }
    return labels;
  };

  const preview = selected ? selected.prompt({ values, labels: labelsFor(selected) }) : "";
  const missing = selected ? missingFields(selected, values) : [];

  const submit = (mode: "send" | "edit") => {
    if (!selected) return;
    setTouched(true);
    if (missing.length) return;
    onUse({ entry: selected, prompt: preview, mode });
    setSelected(null);
    onClose();
  };

  const renderField = (f: ToolField, i: number) => {
    const id = `tool-${selected?.id}-${f.key}`;
    const ref = i === 0 ? (el: HTMLElement | null) => void (firstFieldRef.current = el) : undefined;
    const set = (v: string) => setValues((prev) => ({ ...prev, [f.key]: v }));
    const invalid = touched && f.required && !values[f.key]?.trim();
    let control: React.ReactNode;
    if (f.kind === "textarea") {
      control = <textarea id={id} ref={ref} rows={3} value={values[f.key] ?? ""} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} className={cx(inputCls, "resize-y")} />;
    } else if (f.kind === "text" || f.kind === "url") {
      control = <input id={id} ref={ref} type={f.kind === "url" ? "url" : "text"} value={values[f.key] ?? ""} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} className={inputCls} />;
    } else if (f.kind === "datetime") {
      control = <input id={id} ref={ref} type="datetime-local" value={values[f.key] ?? ""} onChange={(e) => set(e.target.value)} className={inputCls} />;
    } else {
      const options = f.kind === "select" ? f.options : f.kind === "picker" && box ? pickerOptions(f.picker, box, props) : [];
      const placeholder = f.kind === "picker" ? (f.required ? "Elige una opción" : f.emptyLabel ?? "Ninguno") : undefined;
      control = (
        <select id={id} ref={ref} value={values[f.key] ?? ""} onChange={(e) => set(e.target.value)} className={inputCls}>
          {placeholder !== undefined && (
            <option value="" disabled={f.required}>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <div key={f.key} className="space-y-1">
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
          {f.label}
          {f.required && <span className="text-orange-600"> *</span>}
        </label>
        {control}
        {f.help && <p className="text-[0.6875rem] text-slate-500">{f.help}</p>}
        {invalid && <p className="text-[0.6875rem] text-red-600">Falta este dato.</p>}
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/40 lg:bg-slate-950/20" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Herramientas del agente"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[26rem] bg-white shadow-2xl border-l border-slate-200 flex flex-col"
      >
        {/* Encabezado */}
        <div className="px-4 py-3 border-b border-slate-200/80 flex items-start justify-between gap-3 bg-slate-50/60 shrink-0">
          <div className="min-w-0">
            {selected ? (
              <button type="button" onClick={() => setSelected(null)} className="text-[0.6875rem] font-semibold text-slate-500 hover:text-slate-800 mb-0.5">
                ← Todas las herramientas
              </button>
            ) : (
              <p className="text-[0.6875rem] text-slate-400 truncate">{projectName}</p>
            )}
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              {selected ? (
                <>
                  <span aria-hidden="true">{selected.icon}</span> {selected.title}
                </>
              ) : (
                "Herramientas del agente"
              )}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Cerrar herramientas">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error ? (
          <div className="p-4 text-xs text-red-700 bg-red-50 m-4 rounded-xl">{error}</div>
        ) : !box ? (
          <div className="p-4 space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : selected ? (
          /* Formulario de la herramienta */
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">{selected.description}</p>
              {selected.fields.length > 0 ? (
                <div className="space-y-3">{selected.fields.map(renderField)}</div>
              ) : (
                <p className="text-xs text-slate-500">No necesita datos: el agente usa lo que ya sabe del proyecto.</p>
              )}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-400">Mensaje para el agente</p>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{preview}</p>
                <p className="text-[0.6875rem] text-slate-400">
                  Usará: {selected.tools.map((t) => <code key={t} className="mr-1 px-1 py-0.5 rounded bg-white border border-slate-200 text-[0.625rem]">{t}</code>)}
                </p>
              </div>
              {touched && missing.length > 0 && (
                <p role="alert" className="text-xs text-red-600">
                  Completa: {missing.join(", ")}.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Lista de herramientas */
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 pb-2 space-y-2.5 sticky top-0 bg-white/95 backdrop-blur-xs z-10 border-b border-slate-100">
              <p className="text-xs text-slate-500 leading-relaxed">
                Elige una herramienta, completa el contexto y el agente la usa en este hilo.
              </p>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar herramienta…"
                aria-label="Buscar herramienta"
                className={inputCls}
              />
              <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none]">
                {[{ id: "all" as const, label: "Todas" }, ...TOOL_CATEGORIES.filter((c) => entries.some((e) => e.category === c.id))].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    aria-pressed={category === c.id}
                    className={cx(
                      "shrink-0 px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold border transition",
                      category === c.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 pt-3 space-y-5">
              {TOOL_CATEGORIES.map((cat) => {
                const list = visible.filter((e) => e.category === cat.id);
                if (!list.length) return null;
                return (
                  <section key={cat.id} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="shrink-0 whitespace-nowrap text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">{cat.label}</h3>
                      <span className="text-[0.6875rem] text-slate-400 truncate">{cat.hint}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {list.map((entry) => {
                        const reason = blocker(entry, box, props);
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              onClick={() => choose(entry)}
                              disabled={!!reason || disabled}
                              className={cx(
                                "w-full text-left flex items-start gap-3 p-3 rounded-xl border transition group",
                                reason ? "border-slate-100 bg-slate-50/60 cursor-not-allowed" : "border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40",
                              )}
                            >
                              <span
                                className={cx(
                                  "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-base border",
                                  reason ? "bg-white border-slate-100 grayscale opacity-60" : "bg-orange-50 border-orange-200/60",
                                )}
                                aria-hidden="true"
                              >
                                {entry.icon}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={cx("block text-xs font-semibold", reason ? "text-slate-400" : "text-slate-800")}>{entry.title}</span>
                                <span className={cx("block text-[0.6875rem] leading-snug mt-0.5", reason ? "text-slate-400" : "text-slate-500")}>{reason ?? entry.description}</span>
                              </span>
                              {!reason && (
                                <span className="shrink-0 self-center text-[0.6875rem] font-semibold text-orange-600 opacity-70 group-hover:opacity-100">Usar →</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {visible.length === 0 && <p className="text-xs text-slate-500 text-center py-6">Ninguna herramienta coincide con «{query}».</p>}
            </div>
          </div>
        )}

        {selected && box && (
          <div className="p-3 border-t border-slate-200/80 flex items-center justify-end gap-2 shrink-0 bg-white">
            <button
              type="button"
              onClick={() => submit("edit")}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
            >
              Revisar en el chat
            </button>
            <button
              type="button"
              onClick={() => submit("send")}
              disabled={disabled}
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-xl shadow-xs"
            >
              Enviar al agente
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
