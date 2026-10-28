"use client";

import { useState } from "react";
import type { Experiment, ExperimentResult, Hypothesis, ResultOutcome, Uncertainty } from "@/types/domain";
import {
  createExperimentAction,
  experimentTransitionAction,
  hypothesisTransitionAction,
  proposeHypothesisAction,
  recordResultAction,
  reformulateHypothesisAction,
  updateExperimentAction,
} from "@/app/actions";
import { EXPERIMENT_STATUS_LABEL, HYPOTHESIS_STATUS_LABEL, OUTCOME_LABEL, UNCERTAINTY_LABEL } from "@/features/labels";
import { hypothesisIssues } from "@/features/hypotheses/rules";
import { missingForReady } from "@/features/experiments/rules";
import { Button, Card, Field, Notice, Tag, cx, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

type Problem = { id: string; title: string; rank?: number };
type People = Record<string, { id: string; name: string; role: string }>;

const H_COLOR: Record<Hypothesis["status"], string> = {
  draft: "var(--color-muted)",
  pending_approval: "var(--color-highlight)",
  approved: "var(--color-cyan)",
  testing: "var(--color-cyan)",
  supported: "var(--color-ok)",
  weakened: "var(--color-danger)",
  inconclusive: "var(--color-highlight)",
  reformulated: "var(--color-faint)",
  discarded: "var(--color-faint)",
};

/* ───────────── Hipótesis ───────────── */

type HForm = {
  statement: string;
  segment: string;
  whyItMatters: string;
  currentEvidence: string;
  uncertainty: Uncertainty;
  costOfBeingWrong: string;
  evaluationCriterion: string;
  relatedItemId?: string;
};

const EMPTY_H: HForm = { statement: "", segment: "", whyItMatters: "", currentEvidence: "", uncertainty: "high", costOfBeingWrong: "", evaluationCriterion: "" };

function HypothesisForm({ initial, problems, submitLabel, onSubmit, pending, error }: { initial: HForm; problems: Problem[]; submitLabel: string; onSubmit: (h: HForm) => void; pending: boolean; error: string | null }) {
  const [h, setH] = useState<HForm>(initial);
  const issues = h.statement ? hypothesisIssues(h) : [];
  const set = (k: keyof HForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setH({ ...h, [k]: e.target.value || (k === "relatedItemId" ? undefined : "") });
  const uid = initial.statement ? "hr" : "hn";
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(h);
      }}
    >
      <div className="md:col-span-2">
        <Field id={`${uid}-st`} label="Afirmación que querés comprobar" hint="Específica y observable. Ej.: «Al menos 5 de 20 … pagarán por adelantado …».">
          <textarea id={`${uid}-st`} rows={2} className={inputClass} value={h.statement} onChange={set("statement")} maxLength={600} required aria-describedby={issues.length ? `${uid}-issues` : `${uid}-st-hint`} />
        </Field>
        {issues.length > 0 && (
          <ul id={`${uid}-issues`} className="mt-2 space-y-1 text-xs text-highlight" aria-live="polite">
            {issues.map((i) => (
              <li key={i}>• {i}</li>
            ))}
          </ul>
        )}
      </div>
      <Field id={`${uid}-seg`} label="Persona o segmento">
        <input id={`${uid}-seg`} className={inputClass} value={h.segment} onChange={set("segment")} maxLength={200} />
      </Field>
      <Field id={`${uid}-rel`} label="Problema relacionado">
        <select id={`${uid}-rel`} className={inputClass} value={h.relatedItemId ?? ""} onChange={set("relatedItemId")}>
          <option value="">Ninguno</option>
          {problems.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rank ? `#${p.rank} ` : ""}
              {p.title}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${uid}-why`} label="Por qué importa">
        <textarea id={`${uid}-why`} rows={2} className={inputClass} value={h.whyItMatters} onChange={set("whyItMatters")} maxLength={600} />
      </Field>
      <Field id={`${uid}-ev`} label="Evidencia actual">
        <textarea id={`${uid}-ev`} rows={2} className={inputClass} value={h.currentEvidence} onChange={set("currentEvidence")} maxLength={600} placeholder="Si no hay, decilo: también es información." />
      </Field>
      <Field id={`${uid}-cost`} label="Consecuencia de estar equivocado">
        <textarea id={`${uid}-cost`} rows={2} className={inputClass} value={h.costOfBeingWrong} onChange={set("costOfBeingWrong")} maxLength={600} />
      </Field>
      <Field id={`${uid}-crit`} label="Criterio para evaluarla">
        <textarea id={`${uid}-crit`} rows={2} className={inputClass} value={h.evaluationCriterion} onChange={set("evaluationCriterion")} maxLength={600} />
      </Field>
      <Field id={`${uid}-unc`} label="Incertidumbre">
        <select id={`${uid}-unc`} className={inputClass} value={h.uncertainty} onChange={set("uncertainty")}>
          {Object.entries(UNCERTAINTY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>
      <div className="flex items-end">
        <Button variant="primary" type="submit" disabled={pending} className="w-full">
          {submitLabel}
        </Button>
      </div>
      {error && (
        <div className="md:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </form>
  );
}

export function NewHypothesis({ projectId, problems }: { projectId: string; problems: Problem[] }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error } = useAction();
  const top = problems.find((p) => p.rank === 1);
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Nueva hipótesis {top && <span className="normal-case tracking-normal text-faint">· problema prioritario: {top.title}</span>}</p>
        <Button size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "+ Proponer hipótesis"}
        </Button>
      </div>
      {open && (
        <div className="mt-4">
          <HypothesisForm
            initial={{ ...EMPTY_H, relatedItemId: top?.id }}
            problems={problems}
            submitLabel="Guardar como borrador"
            pending={pending}
            error={error}
            onSubmit={(h) => run(() => proposeHypothesisAction(projectId, h), () => setOpen(false))}
          />
        </div>
      )}
    </Card>
  );
}

export function HypothesisCard(props: {
  projectId: string;
  hypothesis: Hypothesis;
  all: Hypothesis[];
  experiments: Experiment[];
  results: ExperimentResult[];
  evidence: Array<{ id: string; title: string }>;
  problems: Problem[];
  perms: Record<string, boolean>;
  people: People;
}) {
  const { projectId, hypothesis: h, perms } = props;
  const [mode, setMode] = useState<null | "reformulate" | "experiment">(null);
  const { run, pending, error } = useAction();
  const go = (to: "submit" | "approve" | "return" | "discard") => run(() => hypothesisTransitionAction(projectId, h.id, to));
  const closed = h.status === "discarded" || h.status === "reformulated";
  const successor = h.supersededBy ? props.all.find((x) => x.id === h.supersededBy) : undefined;
  const canDesign = perms["experiment.design"] && ["approved", "testing", "inconclusive", "supported", "weakened"].includes(h.status);

  return (
    <Card as="li" className={cx("p-5", closed && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={H_COLOR[h.status]}>{HYPOTHESIS_STATUS_LABEL[h.status]}</Tag>
        <Tag>{UNCERTAINTY_LABEL[h.uncertainty]}</Tag>
        {h.approvedBy && <span className="text-[0.6875rem] text-faint">Aprobada por {props.people[h.approvedBy]?.name}</span>}
        <span className="ml-auto text-[0.6875rem] text-faint">
          Propuesta por {h.proposedBy === "ai" ? "la IA" : props.people[h.proposedBy]?.name} · {formatDate(h.createdAt)}
        </span>
      </div>
      <p className={cx("display mt-3 text-2xl leading-tight", closed && "line-through decoration-1")}>{h.statement}</p>
      {successor && <p className="mt-1 text-xs text-cyan">Reformulada como: «{successor.statement.slice(0, 120)}»</p>}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Def label="Segmento" value={h.segment} />
        <Def label="Por qué importa" value={h.whyItMatters} />
        <Def label="Evidencia actual" value={h.currentEvidence} />
        <Def label="Si estamos equivocados" value={h.costOfBeingWrong} />
        <Def label="Criterio de evaluación" value={h.evaluationCriterion} />
        <Def label="Problema" value={props.problems.find((p) => p.id === h.relatedItemId)?.title} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {h.status === "draft" && perms["hypothesis.propose"] && (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => go("submit")}>
            Enviar a aprobación del mentor
          </Button>
        )}
        {h.status === "pending_approval" && perms["hypothesis.approve"] && (
          <>
            <Button size="sm" variant="primary" disabled={pending} onClick={() => go("approve")}>
              Aprobar
            </Button>
            <Button size="sm" disabled={pending} onClick={() => go("return")}>
              Devolver a borrador
            </Button>
          </>
        )}
        {h.status === "pending_approval" && !perms["hypothesis.approve"] && <span className="text-xs text-muted">Esperando la aprobación del mentor asignado.</span>}
        {canDesign && (
          <Button size="sm" aria-expanded={mode === "experiment"} onClick={() => setMode(mode === "experiment" ? null : "experiment")}>
            + Diseñar experimento
          </Button>
        )}
        {["supported", "weakened", "inconclusive"].includes(h.status) && perms["hypothesis.propose"] && (
          <Button size="sm" aria-expanded={mode === "reformulate"} onClick={() => setMode(mode === "reformulate" ? null : "reformulate")}>
            Reformular
          </Button>
        )}
        {["draft", "pending_approval", "approved", "weakened", "inconclusive"].includes(h.status) && perms["hypothesis.propose"] && (
          <Button size="sm" variant="danger" disabled={pending} onClick={() => go("discard")}>
            Descartar
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {mode === "reformulate" && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <p className="mb-3 text-xs text-muted">La hipótesis actual se conserva como «Reformulada» con su evidencia; la nueva empieza en borrador.</p>
          <ReformulateForm projectId={projectId} h={h} problems={props.problems} onDone={() => setMode(null)} />
        </div>
      )}
      {mode === "experiment" && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <ExperimentForm
            submitLabel="Crear experimento en diseño"
            onSubmit={(input, done) => run(() => createExperimentAction(projectId, h.id, input), () => (done(), setMode(null)))}
            pending={pending}
          />
        </div>
      )}

      {props.experiments.length > 0 && (
        <ul className="mt-5 space-y-3 border-t border-line pt-5">
          {props.experiments.map((e) => (
            <ExperimentCard key={`${e.id}-${e.version}`} projectId={projectId} e={e} results={props.results.filter((r) => r.experimentId === e.id)} evidence={props.evidence} perms={perms} people={props.people} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReformulateForm({ projectId, h, problems, onDone }: { projectId: string; h: Hypothesis; problems: Problem[]; onDone: () => void }) {
  const { run, pending, error } = useAction();
  return (
    <HypothesisForm
      initial={{ statement: h.statement, segment: h.segment, whyItMatters: h.whyItMatters, currentEvidence: h.currentEvidence, uncertainty: h.uncertainty, costOfBeingWrong: h.costOfBeingWrong, evaluationCriterion: h.evaluationCriterion, relatedItemId: h.relatedItemId }}
      problems={problems}
      submitLabel="Crear versión reformulada"
      pending={pending}
      error={error}
      onSubmit={(input) => run(() => reformulateHypothesisAction(projectId, h.id, input), onDone)}
    />
  );
}

function Def({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="mt-0.5">{value?.trim() ? value : <span className="text-faint">Sin definir</span>}</dd>
    </div>
  );
}

/* ───────────── Experimentos ───────────── */

type EForm = {
  question: string;
  method: string;
  participants: string;
  activities: string[];
  resources: string;
  budget: number | null;
  durationDays: number | null;
  metric: string;
  successCriterion: string;
  rejectionCriterion: string;
  risks: string;
  evidencePlan: string;
};

const EMPTY_E: EForm = { question: "", method: "", participants: "", activities: [], resources: "", budget: null, durationDays: null, metric: "", successCriterion: "", rejectionCriterion: "", risks: "", evidencePlan: "" };

function ExperimentForm({ initial = EMPTY_E, submitLabel, onSubmit, pending, lockedCriteria }: { initial?: EForm; submitLabel: string; onSubmit: (e: EForm, done: () => void) => void; pending: boolean; lockedCriteria?: boolean }) {
  const [f, setF] = useState<EForm>(initial);
  const [acts, setActs] = useState(initial.activities.join("\n"));
  const [uid] = useState(() => `ef${Math.random().toString(36).slice(2, 7)}`);
  const t = (k: keyof EForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (k: "budget" | "durationDays") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === "" ? null : Number(e.target.value) });
  const area = (k: keyof EForm, label: string, hint?: string, disabled?: boolean) => (
    <Field id={`${uid}-${k}`} label={label} hint={hint}>
      <textarea id={`${uid}-${k}`} rows={2} className={inputClass} value={f[k] as string} onChange={t(k)} maxLength={600} disabled={disabled} />
    </Field>
  );
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...f, activities: acts.split("\n") }, () => {});
      }}
    >
      <div className="md:col-span-2">{area("question", "Pregunta que intenta responder")}</div>
      {area("method", "Método")}
      {area("participants", "Participantes o fuentes")}
      <Field id={`${uid}-acts`} label="Actividades (una por línea)">
        <textarea id={`${uid}-acts`} rows={3} className={inputClass} value={acts} onChange={(e) => setActs(e.target.value)} />
      </Field>
      {area("resources", "Recursos necesarios")}
      <Field id={`${uid}-budget`} label="Presupuesto estimado" hint="Dejalo vacío si no lo sabés: no se inventa una cifra.">
        <input id={`${uid}-budget`} type="number" min={0} className={inputClass} value={f.budget ?? ""} onChange={num("budget")} />
      </Field>
      <Field id={`${uid}-dur`} label="Duración (días)">
        <input id={`${uid}-dur`} type="number" min={1} max={365} className={inputClass} value={f.durationDays ?? ""} onChange={num("durationDays")} />
      </Field>
      {area("metric", "Métrica o señal a observar", undefined, lockedCriteria)}
      {area("evidencePlan", "Evidencia que se recopilará")}
      {area("successCriterion", "Criterio de éxito", "Definilo antes de ver resultados.", lockedCriteria)}
      {area("rejectionCriterion", "Criterio de rechazo", undefined, lockedCriteria)}
      <div className="md:col-span-2">{area("risks", "Riesgos y limitaciones")}</div>
      <Button variant="primary" type="submit" disabled={pending} className="md:col-span-2">
        {submitLabel}
      </Button>
    </form>
  );
}

const STEPS: Experiment["status"][] = ["design", "ready", "running", "results_pending", "reviewed"];

function ExperimentCard({ projectId, e, results, evidence, perms, people }: { projectId: string; e: Experiment; results: ExperimentResult[]; evidence: Array<{ id: string; title: string }>; perms: Record<string, boolean>; people: People }) {
  const [mode, setMode] = useState<null | "edit" | "result">(null);
  const { run, pending, error, code, reload } = useAction();
  const step = STEPS.indexOf(e.status);
  const missing = missingForReady(e);

  return (
    <li className="rounded-xl border border-line bg-bg p-4">
      <ol className="flex flex-wrap gap-1" aria-label="Estado del experimento">
        {STEPS.map((s, i) => (
          <li key={s} className={cx("rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.1em]", i === step ? "bg-accent text-white" : i < step ? "bg-white/10 text-muted" : "text-faint")} aria-current={i === step ? "step" : undefined}>
            {EXPERIMENT_STATUS_LABEL[s]}
          </li>
        ))}
      </ol>
      <p className="mt-3 font-semibold">{e.question}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Def label="Método" value={e.method} />
        <Def label="Participantes" value={e.participants} />
        <Def label="Métrica" value={e.metric} />
        <Def label="Criterio de éxito" value={e.successCriterion} />
        <Def label="Criterio de rechazo" value={e.rejectionCriterion} />
        <Def label="Presupuesto" value={e.budget === null ? "Desconocido" : String(e.budget)} />
        <Def label="Duración" value={e.durationDays ? `${e.durationDays} días` : undefined} />
        <Def label="Responsable" value={people[e.ownerId]?.name} />
        <Def label="Riesgos" value={e.risks} />
      </dl>
      {e.activities.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-sm text-muted">
          {e.activities.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {e.criteriaLockedAt && <p className="mt-3 text-xs text-cyan">🔒 Criterios bloqueados el {formatDate(e.criteriaLockedAt)}, antes de observar resultados.</p>}

      {results.map((r) => (
        <div key={r.id} className="mt-3 rounded-lg border border-line p-3 text-sm">
          <p className="flex items-center gap-2">
            <Tag color={r.outcome === "positive" ? "var(--color-ok)" : r.outcome === "negative" ? "var(--color-danger)" : "var(--color-highlight)"}>Resultado {OUTCOME_LABEL[r.outcome].toLowerCase()}</Tag>
            <span className="text-xs text-faint">
              {people[r.recordedBy]?.name} · {formatDate(r.createdAt)}
            </span>
          </p>
          <p className="mt-2">{r.observed}</p>
          <p className="mt-1 text-muted">Valor observado: {r.metricValue || "—"}</p>
          <p className="text-muted">Aprendizaje: {r.learnings || "—"}</p>
          <p className="text-muted">Limitaciones: {r.limitations || "—"}</p>
          {r.outcome === "negative" && <p className="mt-2 text-xs text-cyan">Un resultado negativo no es un fracaso: muestra qué no funciona y orienta el próximo paso.</p>}
        </div>
      ))}

      <div className="mt-3 flex flex-wrap gap-2">
        {(e.status === "design" || e.status === "ready") && perms["experiment.design"] && (
          <Button size="sm" variant="ghost" aria-expanded={mode === "edit"} onClick={() => setMode(mode === "edit" ? null : "edit")}>
            Editar diseño
          </Button>
        )}
        {e.status === "design" && perms["experiment.design"] && (
          <Button size="sm" disabled={pending} onClick={() => run(() => experimentTransitionAction(projectId, e.id, "ready"))} title={missing.length ? `Falta: ${missing.join(", ")}` : undefined}>
            Marcar listo
          </Button>
        )}
        {e.status === "ready" && perms["experiment.start"] && (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => experimentTransitionAction(projectId, e.id, "start"))}>
            Iniciar (bloquea criterios)
          </Button>
        )}
        {e.status === "running" && perms["experiment.record_result"] && (
          <Button size="sm" variant="primary" aria-expanded={mode === "result"} onClick={() => setMode(mode === "result" ? null : "result")}>
            Registrar resultado
          </Button>
        )}
        {e.status === "results_pending" && <span className="text-xs text-muted">Esperando la segunda revisión del mentor.</span>}
      </div>
      {e.status === "design" && missing.length > 0 && <p className="mt-2 text-xs text-faint">Para dejarlo listo falta: {missing.join(", ")}.</p>}
      {error && (
        <div className="mt-3">
          <Notice tone="error">
            {error}{" "}
            {code === "conflict" && (
              <button type="button" className="font-semibold underline" onClick={reload}>
                Cargar la versión actual
              </button>
            )}
          </Notice>
        </div>
      )}

      {mode === "edit" && (
        <div className="mt-3 rounded-lg border border-line p-3">
          <ExperimentForm
            initial={e}
            submitLabel="Guardar diseño"
            pending={pending}
            lockedCriteria={!!e.criteriaLockedAt}
            onSubmit={(input) => run(() => updateExperimentAction(projectId, e.id, input, e.version), () => setMode(null))}
          />
        </div>
      )}
      {mode === "result" && <ResultForm projectId={projectId} e={e} evidence={evidence} onDone={() => setMode(null)} />}
    </li>
  );
}

function ResultForm({ projectId, e, evidence, onDone }: { projectId: string; e: Experiment; evidence: Array<{ id: string; title: string }>; onDone: () => void }) {
  const [outcome, setOutcome] = useState<ResultOutcome>("inconclusive");
  const [observed, setObserved] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [learnings, setLearnings] = useState("");
  const [limitations, setLimitations] = useState("");
  const [ev, setEv] = useState<string[]>([]);
  const { run, pending, error } = useAction();
  const id = (x: string) => `${e.id}-r-${x}`;
  return (
    <form
      className="mt-3 grid gap-3 rounded-lg border border-line p-3 md:grid-cols-2"
      onSubmit={(x) => {
        x.preventDefault();
        run(() => recordResultAction(projectId, e.id, { outcome, observed, metricValue, learnings, limitations, evidenceIds: ev }), onDone);
      }}
    >
      <div className="rounded-lg bg-white/5 p-3 text-xs text-muted md:col-span-2">
        Comparalo con lo definido antes: éxito «{e.successCriterion}» · rechazo «{e.rejectionCriterion}».
      </div>
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Resultado</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(OUTCOME_LABEL) as ResultOutcome[]).map((k) => (
            <label key={k} className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-white">
              <input type="radio" name={id("o")} className="sr-only" checked={outcome === k} onChange={() => setOutcome(k)} />
              {OUTCOME_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id={id("obs")} label="Qué se observó">
        <textarea id={id("obs")} rows={3} className={inputClass} value={observed} onChange={(x) => setObserved(x.target.value)} required maxLength={2000} />
      </Field>
      <Field id={id("mv")} label="Valor de la métrica">
        <input id={id("mv")} className={inputClass} value={metricValue} onChange={(x) => setMetricValue(x.target.value)} maxLength={200} />
      </Field>
      <Field id={id("le")} label="Qué aprendimos">
        <textarea id={id("le")} rows={2} className={inputClass} value={learnings} onChange={(x) => setLearnings(x.target.value)} maxLength={2000} />
      </Field>
      <Field id={id("li")} label="Limitaciones de la evidencia">
        <textarea id={id("li")} rows={2} className={inputClass} value={limitations} onChange={(x) => setLimitations(x.target.value)} maxLength={2000} />
      </Field>
      {evidence.length > 0 && (
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Evidencia adjunta</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {evidence.map((x) => (
              <label key={x.id} className="flex items-center gap-2">
                <input type="checkbox" className="accent-[var(--color-accent)]" checked={ev.includes(x.id)} onChange={(c) => setEv(c.target.checked ? [...ev, x.id] : ev.filter((y) => y !== x.id))} />
                {x.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Button variant="primary" type="submit" disabled={pending} className="md:col-span-2">
        Guardar resultado
      </Button>
      {error && (
        <div className="md:col-span-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </form>
  );
}
