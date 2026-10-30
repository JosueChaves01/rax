"use client";

import { useState } from "react";
import type { Comment, DiagnosisItem, DiagnosisItemHistory, Evidence, Uncertainty } from "@/types/domain";
import { addCommentAction, changeItemAction } from "@/app/actions";
import { INFO_TYPE_LABEL, REVIEW_LABEL, UNCERTAINTY_LABEL } from "@/features/labels";
import { standing } from "@/features/diagnosis/rules";
import type { ItemChange } from "@/features/diagnosis/rules";
import { INFO_COLOR, REVIEW_COLOR, UNCERTAINTY_LEVEL } from "@/shared/ui/domain-colors";
import { Button, Field, Notice, Tag, cx, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { AgentFieldAssist } from "@/shared/ui/agent-field-assist";

export type People = Record<string, { id: string; name: string; role: string }>;

type Mode = null | "edit" | "reject" | "clarify" | "evidence" | "comment" | "history";

const CHANGE_LABEL: Record<DiagnosisItemHistory["change"], string> = {
  created: "Creado",
  edited: "Editado",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  clarification_requested: "Aclaración solicitada",
  marked_unknown: "Marcado como desconocido",
  evidence_attached: "Evidencia adjunta",
  prioritized: "Priorizado",
};

export function ItemCard({
  projectId,
  item,
  history,
  comments,
  evidence,
  people,
  perms,
}: {
  projectId: string;
  item: DiagnosisItem;
  history: DiagnosisItemHistory[];
  comments: Comment[];
  evidence: Evidence[];
  people: People;
  perms: Record<string, boolean>;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const { run, pending, error, code, reload, clear } = useAction();
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [uncertainty, setUncertainty] = useState<Uncertainty>(item.uncertainty);
  const [reason, setReason] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const st = standing(item);
  const name = (id: string) => (id === "ai" ? "IA" : (people[id]?.name ?? "Persona"));
  const lastClarification = [...history].reverse().find((h) => h.change === "clarification_requested");
  const fid = (s: string) => `${item.id}-${s}`;

  const apply = (change: ItemChange) =>
    run(
      () => changeItemAction(projectId, item.id, change, item.version),
      () => {
        setMode(null);
        setReason("");
      },
    );

  const toggle = (m: Mode) => {
    clear();
    setMode(mode === m ? null : m);
  };

  const canEdit = perms["diagnosis.edit"];
  const isRejected = item.reviewStatus === "rejected";

  return (
    <li
      className={cx(
        "rounded-2xl border p-4.5 transition-all shadow-2xs hover:shadow-xs",
        st === "proposal"
          ? "border-amber-300 bg-amber-50/20"
          : st === "rejected"
            ? "border-slate-200 bg-slate-50/60 opacity-60"
            : st === "evidence_backed"
              ? "border-emerald-300 bg-emerald-50/20"
              : "border-slate-200 bg-white hover:border-slate-300",
        item.infoType === "unknown" && "border-dashed",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag color={INFO_COLOR[item.infoType]} dashed={item.infoType === "unknown"}>
          {item.authorId === "ai" && item.infoType === "ai_interpretation" ? "◆ " : ""}
          {INFO_TYPE_LABEL[item.infoType]}
        </Tag>
        <Tag color={REVIEW_COLOR[item.reviewStatus]}>{REVIEW_LABEL[item.reviewStatus]}</Tag>
        <UncertaintyMeter value={item.uncertainty} />
        {item.priority && <Tag color="var(--color-accent)">Prioridad #{item.priority.rank}</Tag>}
        {item.evidenceIds.length > 0 && <Tag color="var(--color-ok)">{item.evidenceIds.length} evidencia(s)</Tag>}
        <span className="ml-auto font-mono text-[0.625rem] text-slate-400">v{item.version}</span>
      </div>

      <h4 className={cx("mt-3 text-sm font-semibold text-slate-900 leading-snug", isRejected && "line-through text-slate-400")}>
        {item.title}
      </h4>
      <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600 leading-relaxed">{item.content}</p>

      <p className="mt-2.5 text-[0.6875rem] text-slate-400">
        {item.source.quote ? (
          <>
            De la conversación: <q className="italic text-slate-500">{item.source.quote}</q>
          </>
        ) : item.authorId === "ai" ? (
          "Inferido por la IA (sin cita literal): requiere confirmación."
        ) : (
          <>Registrado por {name(item.authorId)}</>
        )}{" "}
        · {formatDate(item.updatedAt)}
      </p>
      {item.priority && <p className="mt-1 text-[0.6875rem] text-slate-500 font-medium">Prioridad: {item.priority.rationale} ({name(item.priority.setBy)})</p>}
      {item.reviewStatus === "needs_clarification" && lastClarification?.reason && (
        <p className="mt-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
          <strong>{name(lastClarification.actorId)} pide aclarar:</strong> {lastClarification.reason}
        </p>
      )}
      {comments.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-slate-200 pl-3 text-xs">
          {comments.map((c) => (
            <li key={c.id}>
              <span className="font-semibold text-slate-800">{name(c.authorId)}:</span> <span className="text-slate-600">{c.body}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3" role="group" aria-label={`Acciones sobre ${item.title}`}>
        {canEdit && !isRejected && item.reviewStatus !== "confirmed" && (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => apply({ kind: "confirm" })}>
            Confirmar
          </Button>
        )}
        {canEdit && !isRejected && (
          <Button size="sm" variant="secondary" aria-expanded={mode === "edit"} onClick={() => toggle("edit")}>
            Corregir
          </Button>
        )}
        {canEdit && !isRejected && (
          <Button size="sm" variant="ghost" aria-expanded={mode === "reject"} onClick={() => toggle("reject")}>
            Rechazar
          </Button>
        )}
        {canEdit && !isRejected && item.infoType !== "unknown" && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => apply({ kind: "mark_unknown" })}>
            No lo sé
          </Button>
        )}
        {perms["diagnosis.request_clarification"] && !isRejected && (
          <Button size="sm" variant="ghost" aria-expanded={mode === "clarify"} onClick={() => toggle("clarify")}>
            Pedir aclaración
          </Button>
        )}
        {perms["evidence.add"] && !isRejected && (
          <Button size="sm" variant="ghost" aria-expanded={mode === "evidence"} onClick={() => toggle("evidence")}>
            Evidencia
          </Button>
        )}
        {perms["diagnosis.comment"] && (
          <Button size="sm" variant="ghost" aria-expanded={mode === "comment"} onClick={() => toggle("comment")}>
            Comentar
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-expanded={mode === "history"} onClick={() => toggle("history")}>
          Historial ({history.length})
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Notice tone="error">
            {error}
            {code === "conflict" && (
              <>
                {" "}
                Lo que escribiste sigue en el formulario.{" "}
                <button type="button" className="font-semibold underline" onClick={() => (clear(), reload())}>
                  Cargar la versión actual
                </button>
              </>
            )}
          </Notice>
        </div>
      )}

      {mode === "edit" && (
        <form
          className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-2xs text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ kind: "edit", title, content, uncertainty, reason: reason || undefined });
          }}
        >
          <Field id={fid("t")} label="Título">
            <input id={fid("t")} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
            {canEdit && <AgentFieldAssist projectId={projectId} flowId="RAX-04" stage="conversation" section="Diagnóstico" fieldPath={`diagnosis.items.${item.id}.title`} fieldSchema={{ type: "string", label: "Título del elemento", required: true, maxLength: 120 }} currentValue={title} onApply={setTitle} />}
          </Field>
          <Field id={fid("c")} label="Contenido" hint="Tu corrección prevalece sobre la interpretación de la IA. La versión anterior queda en el historial.">
            <textarea id={fid("c")} className={inputClass} rows={3} value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} required />
            {canEdit && <AgentFieldAssist projectId={projectId} flowId="RAX-04" stage="conversation" section="Diagnóstico" fieldPath={`diagnosis.items.${item.id}.content`} fieldSchema={{ type: "string", label: "Descripción del elemento", required: true, maxLength: 2000 }} currentValue={content} onApply={setContent} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={fid("u")} label="Incertidumbre">
              <select id={fid("u")} className={inputClass} value={uncertainty} onChange={(e) => setUncertainty(e.target.value as Uncertainty)}>
                {Object.entries(UNCERTAINTY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field id={fid("r")} label="Motivo (opcional)">
              <input id={fid("r")} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </Field>
          </div>
          <Button size="sm" variant="primary" disabled={pending} type="submit">
            Guardar corrección
          </Button>
        </form>
      )}

      {(mode === "reject" || mode === "clarify") && (
        <form
          className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-2xs text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            apply(mode === "reject" ? { kind: "reject", reason } : { kind: "request_clarification", reason });
          }}
        >
          <Field id={fid("why")} label={mode === "reject" ? "¿Por qué no te representa?" : "¿Qué necesita aclararse?"}>
            <textarea id={fid("why")} className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
          </Field>
          <Button size="sm" variant={mode === "reject" ? "danger" : "primary"} disabled={pending} type="submit">
            {mode === "reject" ? "Rechazar (queda en el historial)" : "Pedir aclaración"}
          </Button>
        </form>
      )}

      {mode === "evidence" && (
        <form
          className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-2xs text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            if (evidenceId) apply({ kind: "attach_evidence", evidenceId });
          }}
        >
          {evidence.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay evidencias. Agregalas en «Evidencia e historial».</p>
          ) : (
            <>
              <Field id={fid("ev")} label="Evidencia que respalda este elemento">
                <select id={fid("ev")} className={inputClass} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)} required>
                  <option value="">Elegí una evidencia…</option>
                  {evidence.map((ev) => (
                    <option key={ev.id} value={ev.id} disabled={item.evidenceIds.includes(ev.id)}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Button size="sm" variant="primary" disabled={pending || !evidenceId} type="submit">
                Adjuntar
              </Button>
            </>
          )}
        </form>
      )}

      {mode === "comment" && (
        <form
          className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-2xs text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addCommentAction(projectId, "diagnosis_item", item.id, reason),
              () => {
                setReason("");
                setMode(null);
              },
            );
          }}
        >
          <Field id={fid("cm")} label="Comentario">
            <textarea id={fid("cm")} className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} required />
          </Field>
          <Button size="sm" variant="primary" disabled={pending} type="submit">
            Comentar
          </Button>
        </form>
      )}

      {mode === "history" && (
        <ol className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-700 shadow-2xs" aria-label="Historial del elemento">
          {[...history].reverse().map((h) => (
            <li key={h.id} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[0.6875rem]">
                <span className="font-semibold text-slate-800">
                  {name(h.actorId)} · {CHANGE_LABEL[h.change]}
                </span>
                <span className="font-mono text-slate-400">{formatDate(h.createdAt)}</span>
              </div>
              {h.reason && <p className="italic text-slate-500">«{h.reason}»</p>}
              {h.before && h.before.content !== h.after.content && (
                <p className="border-t border-slate-100 pt-1 text-[0.6875rem] text-slate-500">
                  <del className="text-rose-600 line-through">{h.before.content}</del>
                  <br />
                  <ins className="no-underline text-emerald-700 font-medium">{h.after.content}</ins>
                </p>
              )}
              {h.before && h.before.infoType !== h.after.infoType && (
                <p className="text-slate-500 text-[0.6875rem]">
                  Tipo: {INFO_TYPE_LABEL[h.before.infoType]} → {INFO_TYPE_LABEL[h.after.infoType]}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function UncertaintyMeter({ value }: { value: Uncertainty }) {
  const level = UNCERTAINTY_LEVEL[value];
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate-500 font-medium" title={UNCERTAINTY_LABEL[value]}>
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cx(
              "h-2.5 w-1 rounded-xs transition-colors",
              value === "unknown"
                ? "border border-dashed border-slate-400 bg-slate-100"
                : n <= level
                  ? level === 1
                    ? "bg-emerald-500"
                    : level === 2
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  : "bg-slate-200",
            )}
          />
        ))}
      </span>
      <span>{UNCERTAINTY_LABEL[value]}</span>
    </span>
  );
}
