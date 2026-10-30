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
        "rounded-2xl border bg-panel p-4 transition-colors",
        st === "proposal" ? "border-highlight/40" : st === "rejected" ? "border-line opacity-60" : st === "evidence_backed" ? "border-ok/40" : "border-line",
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
        <span className="ml-auto font-mono text-[0.625rem] text-faint">v{item.version}</span>
      </div>

      <h4 className={cx("mt-3 font-semibold", isRejected && "line-through")}>{item.title}</h4>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{item.content}</p>

      <p className="mt-2 text-[0.6875rem] text-faint">
        {item.source.quote ? (
          <>
            De la conversación: <q className="italic">{item.source.quote}</q>
          </>
        ) : item.authorId === "ai" ? (
          "Inferido por la IA (sin cita literal): requiere confirmación."
        ) : (
          <>Registrado por {name(item.authorId)}</>
        )}{" "}
        · {formatDate(item.updatedAt)}
      </p>
      {item.priority && <p className="mt-1 text-[0.6875rem] text-faint">Prioridad: {item.priority.rationale} ({name(item.priority.setBy)})</p>}
      {item.reviewStatus === "needs_clarification" && lastClarification?.reason && (
        <p className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-xs">
          <strong>{name(lastClarification.actorId)} pide aclarar:</strong> {lastClarification.reason}
        </p>
      )}
      {comments.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-line pl-3 text-xs">
          {comments.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{name(c.authorId)}:</span> <span className="text-muted">{c.body}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label={`Acciones sobre ${item.title}`}>
        {canEdit && !isRejected && item.reviewStatus !== "confirmed" && (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => apply({ kind: "confirm" })}>
            Confirmar
          </Button>
        )}
        {canEdit && !isRejected && (
          <Button size="sm" variant="ghost" aria-expanded={mode === "edit"} onClick={() => toggle("edit")}>
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
          className="mt-3 space-y-3 rounded-xl border border-line p-3"
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
          className="mt-3 space-y-3 rounded-xl border border-line p-3"
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
          className="mt-3 space-y-3 rounded-xl border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (evidenceId) apply({ kind: "attach_evidence", evidenceId });
          }}
        >
          {evidence.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay evidencias. Agregalas en «Evidencia e historial».</p>
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
          className="mt-3 space-y-3 rounded-xl border border-line p-3"
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
        <ol className="mt-3 space-y-2 rounded-xl border border-line p-3 text-xs" aria-label="Historial del elemento">
          {[...history].reverse().map((h) => (
            <li key={h.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
              <p>
                <span className="font-mono text-faint">v{h.version}</span> <strong>{CHANGE_LABEL[h.change]}</strong> por {name(h.actorId)} ·{" "}
                <span className="text-faint">{formatDate(h.createdAt)}</span>
              </p>
              {h.reason && <p className="text-muted">Motivo: {h.reason}</p>}
              {h.before && h.before.content !== h.after.content && (
                <p className="mt-1">
                  <del className="text-faint">{h.before.content}</del>
                  <br />
                  <ins className="no-underline">{h.after.content}</ins>
                </p>
              )}
              {h.before && h.before.infoType !== h.after.infoType && (
                <p className="text-muted">
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
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-muted" title={UNCERTAINTY_LABEL[value]}>
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cx("h-2.5 w-1 rounded-sm", value === "unknown" ? "border border-dashed border-faint" : n <= level ? "bg-highlight" : "bg-white/15")} />
        ))}
      </span>
      {UNCERTAINTY_LABEL[value]}
    </span>
  );
}
