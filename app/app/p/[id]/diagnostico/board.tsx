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
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Filtrar elementos" className="flex flex-wrap gap-1">
          {FILTERS.map(([f, label]) => (
            <button
              key={f}
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cx(
                "rounded-full border px-3 py-1 text-xs",
                filter === f ? "border-accent bg-accent text-white" : "border-line-strong text-muted hover:text-ink",
              )}
            >
              {label} <span className="font-mono opacity-80">{counts[f]}</span>
            </button>
          ))}
        </div>
        {props.perms["diagnosis.edit"] && (
          <Button size="sm" className="ml-auto" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            + Agregar a mano
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
          <section key={c} aria-labelledby={`cat-${c}`}>
            <h3 id={`cat-${c}`} className="eyebrow mb-2 flex items-center gap-2">
              {CATEGORY_LABEL[c]} <span className="font-mono text-faint">{items.length}</span>
            </h3>
            <ul className="grid gap-3 2xl:grid-cols-2">
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
    <details className="rounded-xl border border-line px-4 py-2 text-xs text-muted">
      <summary className="cursor-pointer select-none">Cómo leer las tarjetas</summary>
      <div className="mt-2 flex flex-wrap gap-1.5 pb-2">
        {types.map((t) => (
          <Tag key={t} color={INFO_COLOR[t]} dashed={t === "unknown"}>
            {INFO_TYPE_LABEL[t]}
          </Tag>
        ))}
      </div>
      <p className="pb-2">
        Borde amarillo: propuesta pendiente de confirmar. Borde verde: respaldado por evidencia. Borde punteado: dato desconocido, que también es
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
      className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addItemAction(projectId, { category, title, content, infoType, uncertainty }), onDone);
      }}
    >
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
          Agregar
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
      <section className="rounded-2xl border border-dashed border-line-strong bg-panel/50 p-5">
        <p className="eyebrow">Resumen inicial</p>
        <p className="mt-2 text-sm text-muted">
          Todavía no hay contexto suficiente para un primer resumen. Aparece cuando la conversación cubre al menos el problema y las personas
          involucradas.
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="summary-title" className={cx("rounded-2xl border p-5", confirmedAt ? "border-line bg-panel" : "border-highlight/50 bg-highlight/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="summary-title" className="eyebrow">
          Resumen inicial
        </h2>
        {confirmedAt ? (
          <Tag color="var(--color-ok)">
            Confirmado {confirmedBy ? `por ${confirmedBy}` : ""} · {formatDate(confirmedAt)}
          </Tag>
        ) : (
          <Tag color="var(--color-highlight)">Pendiente de tu confirmación</Tag>
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
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
      )}
      {!confirmedAt && canConfirm && !editing && (
        <div className="mt-4 rounded-xl border border-line bg-bg p-4">
          <p className="display text-xl">
            ¿Esto representa lo que querés hacer <span className="text-highlight">o hay algo que corregir?</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => confirmSummaryAction(projectId))}>
              Sí, me representa
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              Corregir el resumen
            </Button>
          </div>
        </div>
      )}
      {confirmedAt && canConfirm && !editing && (
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => setEditing(true)}>
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
