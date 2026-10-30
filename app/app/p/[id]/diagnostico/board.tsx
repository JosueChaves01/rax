"use client";

import { useMemo, useState } from "react";
import type { Comment, DiagnosisCategory, DiagnosisItem, DiagnosisItemHistory, Evidence, InfoType, Uncertainty } from "@/types/domain";
import { addItemAction, confirmSummaryAction, editSummaryAction } from "@/app/actions";
import { CATEGORY_LABEL, CATEGORY_ORDER, INFO_TYPE_LABEL, UNCERTAINTY_LABEL } from "@/features/labels";
import { isCurrent, openQuestions, pendingReview } from "@/features/diagnosis/rules";
import { INFO_COLOR } from "@/shared/ui/domain-colors";
import { Button, Empty, Field, Notice, Tag, cx, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { ItemCard, type People } from "./item-card";

type Filter = "current" | "pending" | "open" | "rejected";

export function DiagnosisBoard(props: {
  projectId: string;
  items: DiagnosisItem[];
  history: DiagnosisItemHistory[];
  comments: Comment[];
  evidence: Evidence[];
  people: People;
  perms: Record<string, boolean>;
}) {
  const [filter, setFilter] = useState<Filter>("current");
  const [adding, setAdding] = useState(false);
  const counts = {
    current: props.items.filter(isCurrent).length,
    pending: pendingReview(props.items).length,
    open: openQuestions(props.items).length,
    rejected: props.items.filter((i) => i.reviewStatus === "rejected").length,
  };
  const visible = useMemo(() => {
    const src =
      filter === "pending" ? pendingReview(props.items) : filter === "open" ? openQuestions(props.items) : filter === "rejected" ? props.items.filter((i) => !isCurrent(i)) : props.items.filter(isCurrent);
    return CATEGORY_ORDER.map((c) => ({ c, items: src.filter((i) => i.category === c).sort((a, b) => (a.priority?.rank ?? 99) - (b.priority?.rank ?? 99)) })).filter((g) => g.items.length);
  }, [filter, props.items]);

  const FILTERS: Array<[Filter, string]> = [
    ["current", "Vigente"],
    ["pending", "Por confirmar"],
    ["open", "Preguntas abiertas"],
    ["rejected", "Rechazado (trazabilidad)"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Filtrar elementos" className="flex flex-wrap gap-1.5">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cx(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition cursor-pointer flex items-center gap-1.5",
                filter === f
                  ? "border-accent bg-accent text-white font-semibold shadow-xs"
                  : "border-line bg-panel text-muted hover:text-ink hover:border-line-strong",
              )}
            >
              <span>{label}</span>
              <span
                className={cx(
                  "font-mono text-[10px] px-1.5 py-0.5 rounded-full",
                  filter === f ? "bg-accent-strong text-white" : "bg-surface text-muted",
                )}
              >
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
        {props.perms["diagnosis.edit"] && (
          <Button size="sm" variant="secondary" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            {adding ? "Cerrar formulario" : "+ Agregar elemento"}
          </Button>
        )}
      </div>

      <Legend />

      {adding && <AddItemForm projectId={props.projectId} onDone={() => setAdding(false)} />}

      {visible.length === 0 ? (
        <Empty title={filter === "pending" ? "Nada por confirmar" : filter === "rejected" ? "Nada rechazado" : "Todavía vacío"}>
          {filter === "current" ? "El diagnóstico se construye a partir de la conversación. Empezá contando tu idea." : undefined}
        </Empty>
      ) : (
        visible.map(({ c, items }) => (
          <section key={c} aria-labelledby={`cat-${c}`} className="space-y-3">
            <div className="flex items-center gap-2 border-b border-line pb-2 pt-2">
              <h3 id={`cat-${c}`} className="eyebrow">
                {CATEGORY_LABEL[c]}
              </h3>
              <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface text-muted border border-line">
                {items.length}
              </span>
            </div>
            <ul className="grid gap-3.5 2xl:grid-cols-2">
              {items.map((i) => (
                <ItemCard
                  key={`${i.id}-${i.version}`}
                  projectId={props.projectId}
                  item={i}
                  history={props.history.filter((h) => h.itemId === i.id)}
                  comments={props.comments.filter((cm) => cm.targetId === i.id)}
                  evidence={props.evidence}
                  people={props.people}
                  perms={props.perms}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Legend() {
  const types: InfoType[] = ["entrepreneur_statement", "documented_observation", "verifiable_evidence", "ai_interpretation", "hypothesis", "human_correction", "unknown", "agreed_decision"];
  return (
    <details className="rounded-2xl border border-line bg-panel p-3.5 text-xs text-muted shadow-2xs group">
      <summary className="cursor-pointer select-none font-semibold text-ink hover:text-ink flex items-center gap-2">
        <span>ℹ️</span>
        <span>Cómo leer las tarjetas y tipos de información</span>
      </summary>
      <div className="mt-3 flex flex-wrap gap-1.5 pb-2 border-t border-line pt-3">
        {types.map((t) => (
          <Tag key={t} color={INFO_COLOR[t]} dashed={t === "unknown"}>
            {INFO_TYPE_LABEL[t]}
          </Tag>
        ))}
      </div>
      <p className="pb-1 text-faint text-[11px] leading-relaxed">
        <strong>Borde amarillo:</strong> propuesta pendiente de confirmar. <strong>Borde verde:</strong> respaldado por evidencia. <strong>Borde punteado:</strong> dato desconocido, que también es
        información válida. Que alguien haya afirmado algo no significa que esté verificado.
      </p>
    </details>
  );
}

function AddItemForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [category, setCategory] = useState<DiagnosisCategory>("problem");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [infoType, setInfoType] = useState<InfoType>("entrepreneur_statement");
  const [uncertainty, setUncertainty] = useState<Uncertainty>("medium");
  const { run, pending, error } = useAction();
  const allowed: InfoType[] = ["entrepreneur_statement", "documented_observation", "hypothesis", "unknown"];
  return (
    <form
      className="grid gap-3.5 rounded-2xl border border-line bg-panel p-5 shadow-xs sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addItemAction(projectId, { category, title, content, infoType, uncertainty }), onDone);
      }}
    >
      <div className="sm:col-span-2 border-b border-line pb-2">
        <h4 className="text-sm font-bold">Agregar elemento al diagnóstico</h4>
        <p className="text-xs text-muted">Registra manualmente una afirmación, hecho o incógnita.</p>
      </div>
      <Field id="ai-cat" label="Sección">
        <select id="ai-cat" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as DiagnosisCategory)}>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </Field>
      <Field id="ai-type" label="¿Qué tipo de información es?">
        <select id="ai-type" className={inputClass} value={infoType} onChange={(e) => setInfoType(e.target.value as InfoType)}>
          {allowed.map((t) => (
            <option key={t} value={t}>{INFO_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="ai-title" label="Título">
          <input id="ai-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="ai-content" label="Contenido">
          <textarea id="ai-content" className={inputClass} rows={3} value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} required />
        </Field>
      </div>
      <Field id="ai-unc" label="Incertidumbre">
        <select id="ai-unc" className={inputClass} value={uncertainty} onChange={(e) => setUncertainty(e.target.value as Uncertainty)} disabled={infoType === "unknown"}>
          {Object.entries(UNCERTAINTY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>
      <div className="flex items-end">
        <Button variant="primary" type="submit" disabled={pending} className="w-full">
          Agregar al diagnóstico
        </Button>
      </div>
      {error && (
        <div className="sm:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </form>
  );
}

export function SummaryPanel({
  projectId,
  summary,
  confirmedAt,
  confirmedBy,
  canConfirm,
}: {
  projectId: string;
  summary?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  canConfirm: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(summary ?? "");
  const { run, pending, error } = useAction();

  if (!summary) {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-panel p-5">
        <p className="eyebrow">Resumen inicial de la etapa</p>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          Todavía no hay contexto suficiente para un primer resumen. Se sintetiza a partir de las respuestas en la conversación de la etapa Entender.
        </p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="summary-title"
      className={cx(
        "rounded-2xl border p-5 shadow-xs transition-colors",
        confirmedAt
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-amber-200/90 bg-amber-50/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{confirmedAt ? "✓" : "📝"}</span>
          <h2 id="summary-title" className="eyebrow">
            Resumen inicial de diagnóstico
          </h2>
        </div>
        {confirmedAt ? (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Confirmado {confirmedBy ? `por ${confirmedBy}` : ""} · {formatDate(confirmedAt)}
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            Pendiente de confirmación
          </span>
        )}
      </div>
      {editing ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => editSummaryAction(projectId, text), () => setEditing(false));
          }}
        >
          <label htmlFor="summary-text" className="sr-only">
            Resumen
          </label>
          <textarea id="summary-text" rows={6} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" type="submit" disabled={pending}>
              Guardar
            </Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 font-normal">{summary}</p>
      )}
      {!confirmedAt && canConfirm && !editing && (
        <div className="mt-4 rounded-xl border border-line bg-panel p-4 shadow-2xs">
          <p className="text-sm font-semibold">
            ¿Esto representa lo que querés hacer <span className="text-highlight font-bold">o hay algo que corregir?</span>
          </p>
          <p className="text-xs text-muted mt-1">
            Al confirmar este resumen, se transferirá como contexto para tu mentor en la <strong>Etapa 2 · Orientar</strong>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => confirmSummaryAction(projectId))}>
              ✓ Sí, me representa
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Corregir el resumen
            </Button>
          </div>
        </div>
      )}
      {confirmedAt && canConfirm && !editing && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEditing(true)}>
          Editar (requiere volver a confirmar)
        </Button>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </section>
  );
}
