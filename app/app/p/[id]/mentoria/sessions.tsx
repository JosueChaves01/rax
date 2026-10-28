"use client";

import { useState } from "react";
import type { Experiment, ExperimentResult, Hypothesis, MentorDecision, MentorSession, SessionNote, SessionNoteKind } from "@/types/domain";
import {
  addNoteAction,
  addNotesBatchAction,
  suggestFirstReviewAction,
  completeFirstReviewAction,
  completeSecondReviewAction,
  requestReviewAction,
  setSharingAction,
} from "@/app/actions";
import { DECISION_LABEL, HYPOTHESIS_STATUS_LABEL, NOTE_KIND_LABEL, OUTCOME_LABEL } from "@/features/labels";
import { Button, Card, Field, Notice, Tag, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

type People = Record<string, { id: string; name: string; role: string }>;

const KIND_TITLE = {
  first_review: ["Primera revisión", "orientar el enfoque."],
  second_review: ["Segunda revisión", "decidir con evidencia."],
} as const;

const STATUS_TAG = {
  pending: ["Pendiente del mentor", "var(--color-highlight)"],
  in_progress: ["En curso", "var(--color-cyan)"],
  completed: ["Completada", "var(--color-ok)"],
} as const;

export function SharingToggle({ projectId, shared }: { projectId: string; shared: boolean }) {
  const { run, pending, error } = useAction();
  return (
    <div className="mt-4 border-t border-line pt-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-accent)]" checked={shared} disabled={pending} onChange={(e) => run(() => setSharingAction(projectId, e.target.checked))} />
        <span>
          Compartir la conversación completa con el mentor
          <span className="block text-xs text-muted">Si no la compartís, el mentor ve el resumen preparado y el diagnóstico, no tus mensajes.</span>
        </span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function ReviewRequests({ projectId, sessions, summaryConfirmed, hasResults }: { projectId: string; sessions: MentorSession[]; summaryConfirmed: boolean; hasResults: boolean }) {
  const { run, pending, error } = useAction();
  const open = (k: MentorSession["kind"]) => sessions.some((s) => s.kind === k && s.status !== "completed");
  const done = (k: MentorSession["kind"]) => sessions.some((s) => s.kind === k && s.status === "completed");
  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <p className="eyebrow">Pedir una revisión</p>
      <div className="mt-3 space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Primera revisión
            {!summaryConfirmed && <span className="block text-xs text-muted">Disponible al confirmar el resumen inicial.</span>}
          </span>
          <Button size="sm" variant="primary" disabled={pending || open("first_review") || done("first_review")} onClick={() => run(() => requestReviewAction(projectId, "first_review"))}>
            {done("first_review") ? "Hecha" : open("first_review") ? "Pedida" : "Pedir"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Segunda revisión
            {!hasResults && <span className="block text-xs text-muted">Disponible cuando registres al menos un resultado.</span>}
          </span>
          <Button size="sm" variant="primary" disabled={pending || open("second_review")} onClick={() => run(() => requestReviewAction(projectId, "second_review"))}>
            {open("second_review") ? "Pedida" : "Pedir"}
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}

export function SessionCard(props: {
  projectId: string;
  session: MentorSession;
  notes: SessionNote[];
  people: People;
  isSessionMentor: boolean;
  items: Array<{ id: string; title: string }>;
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  results: ExperimentResult[];
}) {
  const { session: s } = props;
  const [title, hi] = KIND_TITLE[s.kind];
  const [statusLabel, statusColor] = STATUS_TAG[s.status];
  const b = s.briefing;
  const canAct = props.isSessionMentor && s.status !== "completed";
  const itemTitle = (id?: string) => props.items.find((i) => i.id === id)?.title;

  return (
    <Card as="li" className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="display text-2xl">
          {title} <span className="text-highlight">{hi}</span>
        </h3>
        <Tag color={statusColor}>{statusLabel}</Tag>
        <span className="ml-auto text-xs text-faint">
          {props.people[s.mentorId]?.name ?? "Mentor"} · pedida {formatDate(s.createdAt)}
        </span>
      </div>

      {b && (
        <details className="mt-4 rounded-xl border border-line bg-bg p-4" open={canAct}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Resumen preparado para el mentor · {formatDate(b.generatedAt)}
          </summary>
          <p className="mt-2 text-[0.6875rem] text-faint">
            Armado automáticamente a partir del diagnóstico vigente (sin IA): cada línea proviene de un elemento confirmado, corregido o abierto.
          </p>
          <dl className="mt-3 grid gap-4 text-sm md:grid-cols-2">
            <Brief label="Qué intenta desarrollar" value={b.whatTheyBuild} />
            <Brief label="Etapa" value={b.stage} />
            <Brief label="Problema principal" value={b.mainProblem} />
            <Brief label="Evidencia" list={b.evidence} empty="Sin evidencia registrada." />
            <Brief label="Supuestos sin comprobar" list={b.openAssumptions} empty="Ninguno registrado." />
            <Brief label="Recursos y limitaciones" list={b.resourcesAndLimits} empty="Sin datos." />
            <Brief label="Preguntas que requieren criterio humano" list={b.questionsForMentor} empty="Ninguna." />
          </dl>
        </details>
      )}

      {s.kind === "second_review" && <ResultsDigest hypotheses={props.hypotheses} experiments={props.experiments} results={props.results} />}

      {props.notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {props.notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-line px-4 py-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-faint">
                <Tag color={n.kind === "agreement" ? "var(--color-ok)" : "var(--color-cyan)"}>{NOTE_KIND_LABEL[n.kind]}</Tag>
                {props.people[n.authorId]?.name} · {formatDate(n.createdAt)}
                {n.relatedItemId && <span>· sobre «{itemTitle(n.relatedItemId) ?? "elemento"}»</span>}
              </p>
              <p className="mt-1">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      {s.decision && (
        <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="eyebrow">Decisión del mentor</p>
          <p className="display mt-1 text-2xl">{DECISION_LABEL[s.decision.value]}</p>
          <p className="mt-1 text-sm">{s.decision.justification}</p>
          <p className="mt-1 text-xs text-faint">
            Sobre: {props.hypotheses.find((h) => h.id === s.decision!.hypothesisId)?.statement ?? "hipótesis"} · {formatDate(s.decision.decidedAt)}
          </p>
        </div>
      )}

      {!props.isSessionMentor && s.status !== "completed" && (
        <p className="mt-4 text-sm text-muted">Mientras esperás, podés seguir recopilando información. Nada se aprueba en nombre del mentor.</p>
      )}

      {canAct && <MentorTools {...props} />}
    </Card>
  );
}

function Brief({ label, value, list, empty }: { label: string; value?: string; list?: string[]; empty?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">
        {value ??
          (list && list.length ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {list.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">{empty}</span>
          ))}
      </dd>
    </div>
  );
}

function ResultsDigest({ hypotheses, experiments, results }: { hypotheses: Hypothesis[]; experiments: Experiment[]; results: ExperimentResult[] }) {
  const withResults = experiments.filter((e) => results.some((r) => r.experimentId === e.id));
  if (!withResults.length) return null;
  return (
    <div className="mt-4 space-y-3">
      <p className="eyebrow">Qué se intentó y qué pasó</p>
      {withResults.map((e) => {
        const h = hypotheses.find((x) => x.id === e.hypothesisId);
        return results
          .filter((r) => r.experimentId === e.id)
          .map((r) => (
            <div key={r.id} className="grid gap-3 rounded-xl border border-line p-4 text-sm md:grid-cols-2">
              <div>
                <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-faint">Hipótesis {h && `· ${HYPOTHESIS_STATUS_LABEL[h.status]}`}</p>
                <p className="mt-1">{h?.statement}</p>
                <p className="mt-2 text-[0.6875rem] uppercase tracking-[0.12em] text-faint">Criterios definidos antes</p>
                <p className="mt-1 text-muted">Éxito: {e.successCriterion}</p>
                <p className="text-muted">Rechazo: {e.rejectionCriterion}</p>
              </div>
              <div>
                <p className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.12em] text-faint">
                  Resultado <Tag color={r.outcome === "positive" ? "var(--color-ok)" : r.outcome === "negative" ? "var(--color-danger)" : "var(--color-highlight)"}>{OUTCOME_LABEL[r.outcome]}</Tag>
                </p>
                <p className="mt-1">{r.observed}</p>
                <p className="mt-1 text-muted">Métrica: {r.metricValue}</p>
                <p className="mt-1 text-muted">Aprendizaje: {r.learnings}</p>
                <p className="mt-1 text-muted">Limitaciones: {r.limitations}</p>
                <p className="mt-1 text-xs text-faint">{r.evidenceIds.length} evidencia(s) adjunta(s)</p>
              </div>
            </div>
          ));
      })}
    </div>
  );
}

function MentorTools({ projectId, session: s, items, hypotheses }: { projectId: string; session: MentorSession; items: Array<{ id: string; title: string }>; hypotheses: Hypothesis[] }) {
  const { run, pending, error } = useAction();
  const [kind, setKind] = useState<SessionNoteKind>("observation");
  const [body, setBody] = useState("");
  const [related, setRelated] = useState("");
  const [closing, setClosing] = useState("");
  const [decision, setDecision] = useState<MentorDecision>("continue");
  const decidable = hypotheses.filter((h) => !["draft", "pending_approval", "discarded", "reformulated"].includes(h.status));
  const [hyp, setHyp] = useState(decidable[0]?.id ?? "");
  const [suggestedNotes, setSuggestedNotes] = useState<Array<{ kind: SessionNoteKind; body: string; relatedItemId?: string }>>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const itemTitle = (id?: string) => items.find((i) => i.id === id)?.title;

  const handleSuggest = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const res = await suggestFirstReviewAction(projectId, s.id);
      if (res.ok && res.data) {
        setClosing(res.data.agreement);
        const mappedNotes = (res.data.suggestedNotes ?? []).map((n) => ({
          kind: n.kind as SessionNoteKind,
          body: n.body,
          relatedItemId: n.relatedItemId ?? undefined,
        }));
        setSuggestedNotes(mappedNotes);
        setAiNotice("Propuesta de acuerdo y notas generadas a partir del diagnóstico y contexto actual.");
      } else if (!res.ok) {
        setAiError(res.error);
      }
    } catch {
      setAiError("No se pudo conectar con el asistente de IA.");
    } finally {
      setIsAiLoading(false);
    }
  };
  const fid = (x: string) => `${s.id}-${x}`;

  return (
    <div className="mt-5 grid gap-4 border-t border-line pt-5 lg:grid-cols-2">
      {s.kind === "first_review" && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 lg:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
                <span>✨</span> Asistir con IA · Orientar y acordar
              </p>
              <p className="mt-1 text-xs text-muted">
                Lee el diagnóstico confirmado, supuestos, incógnitas y datos del proyecto para autocompletar el acuerdo y sugerir preguntas u observaciones clave.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              type="button"
              disabled={isAiLoading || pending}
              onClick={handleSuggest}
            >
              {isAiLoading ? "Analizando y redactando..." : "✨ Autocompletar con IA"}
            </Button>
          </div>
          {aiNotice && <p className="text-xs text-[var(--color-ok)] font-medium">{aiNotice}</p>}
          {aiError && <Notice tone="error">{aiError}</Notice>}

          {suggestedNotes.length > 0 && (
            <div className="mt-3 rounded-lg border border-line bg-panel p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">
                  Preguntas, notas y observaciones sugeridas ({suggestedNotes.length})
                </p>
                <Button
                  size="sm"
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    run(
                      () => addNotesBatchAction(projectId, s.id, suggestedNotes),
                      () => {
                        setSuggestedNotes([]);
                        setAiNotice("Todas las notas sugeridas se guardaron en la sesión.");
                      },
                    );
                  }}
                >
                  Guardar todas como notas
                </Button>
              </div>
              <ul className="space-y-2">
                {suggestedNotes.map((n, idx) => (
                  <li key={idx} className="rounded-lg border border-line bg-bg p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Tag color={n.kind === "question" ? "var(--color-highlight)" : n.kind === "observation" ? "var(--color-cyan)" : "var(--color-ok)"}>
                        {NOTE_KIND_LABEL[n.kind]}
                      </Tag>
                      {n.relatedItemId && (
                        <span className="text-faint text-[0.6875rem]">· sobre «{itemTitle(n.relatedItemId) ?? "elemento"}»</span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-ink underline"
                          onClick={() => {
                            setKind(n.kind);
                            setBody(n.body);
                            setRelated(n.relatedItemId ?? "");
                            setSuggestedNotes((prev) => prev.filter((_, i) => i !== idx));
                          }}
                        >
                          Cargar en editor
                        </button>
                        <span className="text-faint">·</span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-accent hover:text-accent-strong"
                          disabled={pending}
                          onClick={() => {
                            run(
                              () => addNoteAction(projectId, s.id, n.kind, n.body, n.relatedItemId),
                              () => setSuggestedNotes((prev) => prev.filter((_, i) => i !== idx)),
                            );
                          }}
                        >
                          Guardar
                        </button>
                        <span className="text-faint">·</span>
                        <button
                          type="button"
                          className="text-xs text-danger hover:underline"
                          onClick={() => setSuggestedNotes((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-ink">{n.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addNoteAction(projectId, s.id, kind, body, related || undefined), () => setBody(""));
        }}
      >
        <p className="eyebrow">Agregar nota</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={fid("k")} label="Tipo">
            <select id={fid("k")} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as SessionNoteKind)}>
              {(["observation", "question", "suggestion"] as const).map((k) => (
                <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field id={fid("rel")} label="Sobre (opcional)">
            <select id={fid("rel")} className={inputClass} value={related} onChange={(e) => setRelated(e.target.value)}>
              <option value="">Todo el proyecto</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.title}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field id={fid("b")} label="Nota">
          <textarea id={fid("b")} rows={3} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required />
        </Field>
        <Button size="sm" type="submit" disabled={pending}>
          Guardar nota
        </Button>
      </form>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            s.kind === "first_review" ? completeFirstReviewAction(projectId, s.id, closing) : completeSecondReviewAction(projectId, s.id, decision, closing, hyp),
          );
        }}
      >
        <p className="eyebrow">{s.kind === "first_review" ? "Cerrar con un acuerdo" : "Registrar la decisión"}</p>
        {s.kind === "second_review" && (
          <>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Decisión</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DECISION_LABEL) as MentorDecision[]).map((k) => (
                  <label key={k} className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-white">
                    <input type="radio" name={fid("dec")} value={k} className="sr-only" checked={decision === k} onChange={() => setDecision(k)} />
                    {DECISION_LABEL[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id={fid("h")} label="Hipótesis">
              <select id={fid("h")} className={inputClass} value={hyp} onChange={(e) => setHyp(e.target.value)} required>
                {decidable.map((h) => (
                  <option key={h.id} value={h.id}>{h.statement.slice(0, 90)}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field id={fid("c")} label={s.kind === "first_review" ? "Qué problema investigar, qué preguntas tienen prioridad y qué falta" : "Justificación"}>
          <textarea id={fid("c")} rows={3} className={inputClass} value={closing} onChange={(e) => setClosing(e.target.value)} maxLength={2000} required />
        </Field>
        <Button size="sm" variant="primary" type="submit" disabled={pending || (s.kind === "second_review" && !hyp)}>
          {s.kind === "first_review" ? "Completar primera revisión" : "Registrar decisión"}
        </Button>
      </form>
      {error && (
        <div className="lg:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}
