"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  Experiment,
  ExperimentResult,
  Hypothesis,
  MentorDecision,
  MentorSession,
  MentorSessionKind,
  MentorshipGoal,
  PreSessionBriefing,
  PostSessionSynthesis,
  RoadmapMilestone,
} from "@/types/domain";
import {
  adoptPostSessionCommitmentsAction,
  closeSessionAction,
  confirmSessionAction,
  generatePostSessionSynthesisAction,
  generatePreSessionBriefingAction,
  requestReviewAction,
  scheduleSessionAction,
  setSharingAction,
  suggestFirstReviewAction,
} from "@/app/actions";
import { ACTION_TYPE_LABEL, DECISION_LABEL, HYPOTHESIS_STATUS_LABEL, OUTCOME_LABEL } from "@/features/labels";
import { Button, Card, Field, Notice, Tag, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { localIsoWithOffset, parseSessionDateTime } from "@/lib/dates";
import { SessionCallPanel } from "@/shared/ui/session-call";
import { NotesTab, useSessionWorkspace } from "@/shared/ui/session-tabs";
import { SynthesisEditor } from "./synthesis-editor";
import { AiNotesDraft } from "./ai-notes-draft";

type People = Record<string, { id: string; name: string; role: string }>;
export type ProblemOption = { id: string; title: string; priority?: { rank: number; rationale: string } };

const KIND_TITLE: Record<MentorSessionKind, readonly [string, string]> = {
  first_review: ["Primera revisión", "orientar el enfoque."],
  second_review: ["Segunda revisión", "decidir con evidencia."],
  exploratory: ["Sesión exploratoria", "evaluar compatibilidad."],
  follow_up: ["Sesión de seguimiento", "ejecución y destrabes."],
  evaluation: ["Evaluación de ciclo", "cierre o renovación."],
};

const STATUS_TAG = {
  pending: ["Pendiente del mentor", "var(--color-highlight)"],
  in_progress: ["En curso", "var(--color-cyan)"],
  completed: ["Completada", "var(--color-ok)"],
} as const;

/** `datetime-local` → ISO (vacío = sin fecha). */
const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined);

export function SharingToggle({ projectId, shared }: { projectId: string; shared: boolean }) {
  const { run, pending, error } = useAction();
  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded accent-blue-600"
          checked={shared}
          disabled={pending}
          onChange={(e) => run(() => setSharingAction(projectId, e.target.checked))}
        />
        <span>
          Compartir la conversación completa con el mentor
          <span className="block text-xs text-slate-500 mt-0.5">
            Si no la compartís, el mentor ve el resumen preparado y el diagnóstico, no tus mensajes privados.
          </span>
        </span>
      </label>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/**
 * Lo que pide el emprendedor: la revisión de esta etapa (con fecha opcional) y, aparte, sesiones de
 * seguimiento. Las revisiones solo se piden por aquí, con sus requisitos.
 */
export function ReviewRequests({
  projectId,
  sessions,
  summaryConfirmed,
  hasResults,
  only,
}: {
  projectId: string;
  sessions: MentorSession[];
  summaryConfirmed: boolean;
  hasResults: boolean;
  /** Muestra solo el pedido de esta revisión (cada etapa pide la suya). */
  only?: MentorSession["kind"];
}) {
  const { run, pending, error } = useAction();
  const [reviewDate, setReviewDate] = useState("");
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");

  const open = (k: MentorSession["kind"]) => sessions.some((s) => s.kind === k && s.status !== "completed");
  const done = (k: MentorSession["kind"]) => sessions.some((s) => s.kind === k && s.status === "completed");

  const row = (kind: "first_review" | "second_review") => {
    const isFirst = kind === "first_review";
    const ready = isFirst ? summaryConfirmed : hasResults;
    const blocked = open(kind) || (isFirst && done(kind));
    return (
      <div className="space-y-3 rounded-xl border border-slate-200/60 bg-slate-50/60 p-3">
        <div>
          <span className="font-semibold text-slate-900">{isFirst ? "Primera revisión" : "Segunda revisión"}</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {blocked
              ? open(kind)
                ? "Pedida: el mentor ya tiene el briefing listo."
                : "Hecha."
              : !ready
                ? isFirst
                  ? "Disponible al confirmar el resumen inicial."
                  : "Disponible cuando registres al menos un resultado."
                : "Proponé fecha y hora: el mentor recibe el pedido con el briefing preparado y confirma la fecha o propone otra."}
          </span>
        </div>
        {!blocked && (
          <div className="flex flex-wrap items-end gap-2">
            <Field id={`${kind}-date`} label="Fecha y hora (opcional)">
              <input id={`${kind}-date`} type="datetime-local" className={inputClass} value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
            </Field>
            <Button
              size="sm"
              variant="primary"
              disabled={pending || !ready}
              onClick={() => run(() => requestReviewAction(projectId, kind, toIso(reviewDate)), () => setReviewDate(""))}
            >
              {pending ? "Pidiendo..." : "Pedir revisión"}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <p className="eyebrow border-b border-slate-200/80 pb-3 text-slate-500">Revisión con tu mentor</p>
      <div className="space-y-3 text-sm">
        {only !== "second_review" && row("first_review")}
        {only !== "first_review" && row("second_review")}
      </div>

      <div className="border-t border-slate-200/80 pt-3">
        {showFollowUp ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => scheduleSessionAction(projectId, { kind: "follow_up", scheduledAt: toIso(followUpDate) }),
                () => {
                  setShowFollowUp(false);
                  setFollowUpDate("");
                },
              );
            }}
          >
            <Field id="follow-up-date" label="Sesión de seguimiento · fecha y hora">
              <input id="follow-up-date" type="datetime-local" className={inputClass} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </Field>
            <Button size="sm" variant="primary" type="submit" disabled={pending}>
              Agendar
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setShowFollowUp(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <button type="button" onClick={() => setShowFollowUp(true)} className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
            + Agendar una sesión de seguimiento
          </button>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** El briefing se prepara solo al pedir la revisión; el mentor puede actualizarlo con el contexto de hoy. */
function RefreshBriefing({ projectId, sessionId, onDone }: { projectId: string; sessionId: string; onDone: (b: PreSessionBriefing) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await generatePreSessionBriefingAction(projectId, sessionId);
            if (res.ok && res.data) onDone(res.data);
            else if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Actualizando briefing..." : "↻ Actualizar briefing"}
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </span>
  );
}

/** Notas de la sesión con sus respuestas: el mentor escribe; el equipo del proyecto responde. */
function SessionNotes({ projectId, sessionId, refreshKey }: { projectId: string; sessionId: string; refreshKey: number }) {
  const ws = useSessionWorkspace(projectId, sessionId);
  const { reload } = ws;
  useEffect(() => {
    if (refreshKey) void reload();
  }, [refreshKey, reload]);
  if (ws.error) return <Notice tone="error">{ws.error}</Notice>;
  if (!ws.data) return <p className="text-xs text-slate-500">Cargando notas…</p>;
  return <NotesTab ws={ws.data} onChanged={reload} />;
}

/** El mentor confirma la fecha pedida o elige otra (queda confirmada con esa). */
function ConfirmDate({ projectId, session }: { projectId: string; session: MentorSession }) {
  const { run, pending, error } = useAction();
  const [date, setDate] = useState(session.scheduledAt ? localIsoWithOffset(session.scheduledAt).slice(0, 16) : "");
  const toIsoCr = (v: string) => {
    try {
      return parseSessionDateTime(v);
    } catch {
      return undefined;
    }
  };
  const changed = Boolean(session.scheduledAt && date && toIsoCr(date) !== session.scheduledAt);
  return (
    <div className="flex w-full flex-wrap items-end gap-2">
      <Field id={`confirm-${session.id}`} label={session.scheduledAt ? "Fecha pedida (podés cambiarla)" : "Fecha y hora de la sesión"}>
        <input id={`confirm-${session.id}`} type="datetime-local" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button size="sm" variant="primary" disabled={pending || !date} onClick={() => run(() => confirmSessionAction(projectId, session.id, changed || !session.scheduledAt ? toIsoCr(date) : undefined))}>
        {pending ? "Confirmando..." : changed ? "Confirmar con esta fecha" : "Confirmar fecha"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function SessionCard(props: {
  projectId: string;
  session: MentorSession;
  people: People;
  isSessionMentor: boolean;
  isOwner?: boolean;
  items: Array<{ id: string; title: string }>;
  problems: ProblemOption[];
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  results: ExperimentResult[];
  goals?: MentorshipGoal[];
  roadmapMilestones?: RoadmapMilestone[];
}) {
  const router = useRouter();
  const { session: s } = props;
  const [title, hi] = KIND_TITLE[s.kind] ?? ["Sesión de mentoría", "acompañamiento"];
  const [statusLabel, statusColor] = STATUS_TAG[s.status];
  const b = s.briefing;
  const [preBrief, setPreBrief] = useState<PreSessionBriefing | undefined>(s.preSessionBriefing);
  const [postSyn, setPostSyn] = useState<PostSessionSynthesis | undefined>(s.postSessionSynthesis);
  const [editingSyn, setEditingSyn] = useState(false);
  const [notesKey, setNotesKey] = useState(0);
  const isOpen = s.status !== "completed";
  const canAct = props.isSessionMentor && isOpen;
  const canEditSynthesis = Boolean(props.isSessionMentor || props.isOwner);

  useEffect(() => {
    if (s.preSessionBriefing) setPreBrief(s.preSessionBriefing);
  }, [s.preSessionBriefing]);

  useEffect(() => {
    if (s.postSessionSynthesis) setPostSyn(s.postSessionSynthesis);
  }, [s.postSessionSynthesis]);

  return (
    <Card as="li" className="p-6 space-y-6 bg-white border border-slate-200/80 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="display text-2xl text-slate-900">
            {title} <span className="text-highlight">{hi}</span>
          </h3>
          <Tag color={statusColor}>{statusLabel}</Tag>
          {s.scheduledAt && (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-medium bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 font-mono">
              📅 {formatDate(s.scheduledAt)}
            </span>
          )}
          {isOpen && (
            <span className={`text-xs font-semibold ${s.confirmedAt ? "text-emerald-700" : "text-amber-700"}`}>
              {s.confirmedAt ? "Fecha confirmada" : s.scheduledAt ? "Fecha por confirmar" : "Sin fecha"}
            </span>
          )}
        </div>
        {canAct && !s.confirmedAt && <ConfirmDate projectId={props.projectId} session={s} />}
        <span className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {canAct && (
            <RefreshBriefing
              projectId={props.projectId}
              sessionId={s.id}
              onDone={(briefing) => {
                setPreBrief(briefing);
                router.refresh();
              }}
            />
          )}
          <span>
            {props.people[s.mentorId]?.name ?? "Mentor"} · creada {formatDate(s.createdAt)}
          </span>
        </span>
      </div>

      {/* 1. Preparación: el briefing (con IA si ya está, si no el resumen del diagnóstico) */}
      {preBrief && (
        <details className="rounded-2xl border border-blue-200/80 bg-blue-50/30 p-5 shadow-xs" open={true}>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center justify-between">
            <span>✨ Briefing Pre-Sesión (4 Capas de Memoria) · {formatDate(preBrief.generatedAt)}</span>
            <span className="text-[0.6875rem] text-blue-700 bg-blue-100/70 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold normal-case">
              Preparación en &lt; 3 minutos
            </span>
          </summary>
          <div className="mt-3.5 space-y-3.5 text-sm pt-3 border-t border-blue-200/70">
            {/* Capa 1: Acuerdos y Objetivos vigentes */}
            <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-blue-700">
                Capa 1: Acuerdos y Objetivos vigentes
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-800 leading-relaxed">
                {preBrief.activeAgreementsAndGoalsSummary}
              </p>
            </div>

            {/* Capa 2: Progreso y Ejecución reciente */}
            <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-blue-700">
                Capa 2: Progreso reciente, problemas diagnósticos y bloqueos
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-800 leading-relaxed">
                {preBrief.recentProgressSummary}
              </p>
            </div>

            {/* Capa 3: Temas pendientes y conversaciones recientes */}
            <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-blue-700">
                Capa 3: Temas pendientes de sesiones previas y chat del asistente
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-800 leading-relaxed">
                {preBrief.pendingTopicsSummary}
              </p>
            </div>

            {/* Capa 4: Propuesta de agenda y preguntas estratégicas */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
                <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-blue-700">
                  Capa 4: Propuesta de Agenda
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-800">
                  {preBrief.suggestedAgenda.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
                <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-blue-700">
                  Capa 4: Preguntas estratégicas sugeridas
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-600 italic">
                  {preBrief.suggestedQuestions.map((q, idx) => (
                    <li key={idx}>«{q}»</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </details>
      )}

      {/* Briefing determinista clásico si no hay preBriefing generado */}
      {!preBrief && b && (
        <details className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 shadow-2xs" open={canAct}>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-slate-700">
            Resumen estructurado para el mentor · {formatDate(b.generatedAt)}
          </summary>
          <dl className="mt-3.5 grid gap-4 text-sm md:grid-cols-2">
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

      {s.kind === "second_review" && (
        <ResultsDigest hypotheses={props.hypotheses} experiments={props.experiments} results={props.results} />
      )}

      {/* 2. La reunión: llamada con transcripción */}
      {isOpen && <SessionCallPanel sessionId={s.id} />}

      {/* 3. Notas (y respuestas) */}
      <SessionNotes projectId={props.projectId} sessionId={s.id} refreshKey={notesKey} />

      {/* 4. Síntesis */}
      {editingSyn ? (
        <SynthesisEditor
          projectId={props.projectId}
          sessionId={s.id}
          initial={postSyn}
          onCancel={() => setEditingSyn(false)}
          onSaved={(syn) => {
            setPostSyn(syn);
            setEditingSyn(false);
            router.refresh();
          }}
        />
      ) : postSyn ? (
        <SynthesisView
          projectId={props.projectId}
          sessionId={s.id}
          postSyn={postSyn}
          people={props.people}
          canEdit={canEditSynthesis}
          canAdopt={!isOpen && canEditSynthesis}
          onEdit={() => setEditingSyn(true)}
        />
      ) : (
        canEditSynthesis &&
        isOpen && (
          <GenerateSynthesis
            projectId={props.projectId}
            sessionId={s.id}
            onGenerated={(syn) => {
              setPostSyn(syn);
              router.refresh();
            }}
            onWrite={() => setEditingSyn(true)}
          />
        )
      )}

      {s.decision && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="eyebrow text-blue-700">Decisión formal del mentor</p>
          <p className="display mt-1 text-2xl text-slate-900">{DECISION_LABEL[s.decision.value]}</p>
          <p className="mt-1 text-sm text-slate-700">{s.decision.justification}</p>
          <p className="mt-1 text-xs text-slate-500">
            Sobre: {props.hypotheses.find((h) => h.id === s.decision!.hypothesisId)?.statement ?? "hipótesis"} · {formatDate(s.decision.decidedAt)}
          </p>
        </div>
      )}

      {!props.isSessionMentor && isOpen && (
        <p className="text-sm text-slate-600">
          Después de la llamada, la síntesis se arma sola. Podés corregirla y responder las notas del mentor; al cerrar la sesión, tus compromisos se vuelven tareas.
        </p>
      )}

      {/* 5. Cierre único del mentor */}
      {canAct && (
        <ClosePanel
          projectId={props.projectId}
          session={s}
          synthesis={postSyn}
          items={props.items}
          problems={props.problems}
          hypotheses={props.hypotheses}
          onNotesSaved={() => setNotesKey((k) => k + 1)}
        />
      )}
    </Card>
  );
}

/** Sin síntesis todavía: se genera desde la llamada (o las notas) o se escribe a mano. */
function GenerateSynthesis({ projectId, sessionId, onGenerated, onWrite }: { projectId: string; sessionId: string; onGenerated: (s: PostSessionSynthesis) => void; onWrite: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
      <p>La síntesis se arma sola al colgar la llamada. Si se reunieron fuera de RAX, generala desde las notas o escribila.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await generatePostSessionSynthesisAction(projectId, sessionId);
              if (res.ok && res.data) onGenerated(res.data);
              else if (!res.ok) setError(res.error);
            })
          }
        >
          {pending ? "Generando..." : "✨ Generar síntesis"}
        </Button>
        <button type="button" onClick={onWrite} className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
          ✎ Escribirla a mano
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/** Propuesta inicial del acuerdo desde la síntesis: lo decidido y los próximos pasos. */
function agreementFrom(syn?: PostSessionSynthesis): string {
  if (!syn) return "";
  return [...syn.agreedDecisions, syn.nextSteps ?? ""].map((x) => x.trim()).filter(Boolean).join("\n");
}

/**
 * Borrador de cierre: el mentor revisa lo que preparó RAX (acuerdo o decisión, prioridad, notas sugeridas)
 * y confirma una sola vez. Al confirmar, los compromisos del emprendedor pasan a ser tareas.
 */
function ClosePanel({
  projectId,
  session: s,
  synthesis,
  items,
  problems,
  hypotheses,
  onNotesSaved,
}: {
  projectId: string;
  session: MentorSession;
  synthesis?: PostSessionSynthesis;
  items: Array<{ id: string; title: string }>;
  problems: ProblemOption[];
  hypotheses: Hypothesis[];
  onNotesSaved: () => void;
}) {
  const { run, pending, error } = useAction();
  const [suggesting, startSuggest] = useTransition();
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [closing, setClosing] = useState(() => agreementFrom(synthesis));
  const [touched, setTouched] = useState(false);
  const current = problems.find((p) => p.priority?.rank === 1);
  const [problemId, setProblemId] = useState(current?.id ?? problems[0]?.id ?? "");
  const [rationale, setRationale] = useState(current?.priority?.rationale ?? "");
  const [decision, setDecision] = useState<MentorDecision>("continue");
  const decidable = useMemo(() => hypotheses.filter((h) => !["draft", "pending_approval", "discarded", "reformulated"].includes(h.status)), [hypotheses]);
  const [hyp, setHyp] = useState(decidable[0]?.id ?? "");
  const fid = (x: string) => `${s.id}-${x}`;

  // Cuando llega la síntesis (al colgar), el acuerdo se propone solo, salvo que el mentor ya escribió.
  useEffect(() => {
    if (!touched && synthesis) setClosing(agreementFrom(synthesis));
  }, [synthesis, touched]);

  const isFirst = s.kind === "first_review";
  const isSecond = s.kind === "second_review";
  const commitments = synthesis?.entrepreneurCommitments.length ?? 0;
  const pendingTasks = synthesis && !synthesis.commitmentsAdoptedAt ? commitments : 0;

  const suggest = () =>
    startSuggest(async () => {
      setSuggestError(null);
      const res = await suggestFirstReviewAction(projectId, s.id);
      if (res.ok && res.data) {
        setClosing(res.data.agreement);
        setTouched(true);
      } else if (!res.ok) setSuggestError(res.error);
    });

  return (
    <div className="space-y-5 border-t border-slate-200/80 pt-5">
      <AiNotesDraft projectId={projectId} sessionId={s.id} items={items} onSaved={onNotesSaved} />

      <form
        className="space-y-4 rounded-2xl border border-blue-200/80 bg-blue-50/30 p-5 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            closeSessionAction(projectId, s.id, {
              agreement: isFirst ? closing : undefined,
              priority: isFirst && problemId ? { itemId: problemId, rationale } : undefined,
              decision: isSecond ? { value: decision, hypothesisId: hyp, justification: closing } : undefined,
              summary: !isFirst && !isSecond ? closing || undefined : undefined,
            }),
          );
        }}
      >
        <div>
          <p className="text-sm font-bold text-slate-900">
            {isFirst ? "Cerrar la primera revisión" : isSecond ? "Registrar la decisión y cerrar" : "Cerrar la sesión de seguimiento"}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {synthesis ? "RAX lo propuso desde la síntesis; revisalo antes de confirmar." : "Completalo vos o generá la síntesis primero para que RAX lo proponga."}
            {pendingTasks > 0 && ` Al confirmar se crean ${pendingTasks === 1 ? "1 tarea" : `${pendingTasks} tareas`} con los compromisos del emprendedor.`}
          </p>
        </div>

        {isSecond && (
          <>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Decisión</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DECISION_LABEL) as MentorDecision[]).map((k) => (
                  <label
                    key={k}
                    className="cursor-pointer rounded-full border border-slate-300 px-3.5 py-1 text-xs font-medium has-[:checked]:border-blue-600 has-[:checked]:bg-blue-600 has-[:checked]:text-white transition-colors"
                  >
                    <input type="radio" name={fid("dec")} value={k} className="sr-only" checked={decision === k} onChange={() => setDecision(k)} />
                    {DECISION_LABEL[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id={fid("h")} label="Hipótesis">
              <select id={fid("h")} className={inputClass} value={hyp} onChange={(e) => setHyp(e.target.value)} required>
                {decidable.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.statement.slice(0, 90)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field
          id={fid("c")}
          label={isFirst ? "Acuerdo: qué investigar y qué falta saber" : isSecond ? "Justificación de la decisión" : "Acuerdos finales (opcional)"}
        >
          <textarea
            id={fid("c")}
            rows={3}
            className={inputClass}
            value={closing}
            onChange={(e) => {
              setClosing(e.target.value);
              setTouched(true);
            }}
            maxLength={2000}
            required={isFirst || isSecond}
          />
        </Field>
        {isFirst && (
          <div className="-mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={suggesting} onClick={suggest} className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50">
              {suggesting ? "Proponiendo..." : "✨ Proponer el acuerdo con IA"}
            </button>
            {suggestError && <span className="text-xs text-rose-700">{suggestError}</span>}
          </div>
        )}

        {isFirst && problems.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={fid("p")} label="Problema a investigar primero">
              <select id={fid("p")} className={inputClass} value={problemId} onChange={(e) => setProblemId(e.target.value)} required>
                {problems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={fid("pr")} label="Por qué va primero">
              <input id={fid("pr")} className={inputClass} value={rationale} onChange={(e) => setRationale(e.target.value)} maxLength={2000} required />
            </Field>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" variant="primary" type="submit" disabled={pending || (isSecond && !hyp)}>
            {pending ? "Cerrando..." : isFirst ? "Confirmar acuerdo y cerrar" : isSecond ? "Registrar decisión y cerrar" : "Cerrar sesión"}
          </Button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </div>
  );
}

function SynthesisView({
  projectId,
  sessionId,
  postSyn,
  people,
  canEdit,
  canAdopt,
  onEdit,
}: {
  projectId: string;
  sessionId: string;
  postSyn: PostSessionSynthesis;
  people: People;
  canEdit: boolean;
  /** Solo después del cierre: si la síntesis llegó tarde, los compromisos se pasan a tareas a mano. */
  canAdopt: boolean;
  onEdit: () => void;
}) {
  const { run, pending, error } = useAction();
  return (
    <>
        <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/30 p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 pb-2.5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Síntesis Pos-Sesión · {formatDate(postSyn.generatedAt)}
              </p>
              <h4 className="font-bold text-slate-900">Resumen ejecutivo y compromisos formalizados</h4>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {postSyn.basedOn === "transcript" ? "Desde la transcripción de la llamada" : postSyn.basedOn === "manual" ? "Escrita a mano" : postSyn.basedOn === "notes" ? "Desde las notas de la sesión" : "Generada por el copiloto"}
                {postSyn.editedAt ? ` · editada por ${people[postSyn.editedBy ?? ""]?.name ?? "el equipo"} ${formatDate(postSyn.editedAt)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button size="sm" type="button" onClick={onEdit}>
                  ✎ Editar o agregar
                </Button>
              )}
              {canAdopt && !postSyn.commitmentsAdoptedAt && postSyn.entrepreneurCommitments.length > 0 && (
                <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => adoptPostSessionCommitmentsAction(projectId, sessionId))}>
                  {pending ? "Creando..." : "Crear tareas con los compromisos"}
                </Button>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{postSyn.summary}</p>

          {postSyn.agreedDecisions.length > 0 && (
            <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
              <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-emerald-800">
                Decisiones y Acuerdos
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-800">
                {postSyn.agreedDecisions.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {postSyn.entrepreneurCommitments.length > 0 && (
              <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
                <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-emerald-800">
                  Compromisos del Emprendedor ({postSyn.entrepreneurCommitments.length}){postSyn.commitmentsAdoptedAt ? " · ya son tareas" : ""}
                </p>
                <ul className="mt-2 space-y-2 text-xs text-slate-800">
                  {postSyn.entrepreneurCommitments.map((c, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <Tag color="var(--color-accent)">
                        {ACTION_TYPE_LABEL[c.actionType ?? "operational_task"]}
                      </Tag>
                      <span className="flex-1 font-medium">{c.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {postSyn.mentorCommitments.length > 0 && (
              <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-2xs">
                <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-emerald-800">
                  Compromisos del Mentor ({postSyn.mentorCommitments.length})
                </p>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                  {postSyn.mentorCommitments.map((mc, idx) => (
                    <li key={idx}>• {mc.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {postSyn.nextSteps && (
            <p className="text-xs text-slate-600">
              <strong className="text-slate-900">Próximos pasos:</strong> {postSyn.nextSteps}
              {postSyn.suggestedNextSessionInDays && (
                <span> · Encuentro sugerido en {postSyn.suggestedNextSessionInDays} días.</span>
              )}
            </p>
          )}
        </div>
      {error && <Notice tone="error">{error}</Notice>}
    </>
  );
}

function Brief({ label, value, list, empty }: { label: string; value?: string; list?: string[]; empty?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-slate-800">
        {value ??
          (list && list.length ? (
            <ul className="list-disc space-y-0.5 pl-4 text-slate-800">
              {list.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          ) : (
            <span className="text-slate-500">{empty}</span>
          ))}
      </dd>
    </div>
  );
}

function ResultsDigest({ hypotheses, experiments, results }: { hypotheses: Hypothesis[]; experiments: Experiment[]; results: ExperimentResult[] }) {
  const withResults = experiments.filter((e) => results.some((r) => r.experimentId === e.id));
  if (!withResults.length) return null;
  return (
    <div className="space-y-3">
      <p className="eyebrow text-slate-500">Qué se intentó y qué pasó</p>
      {withResults.map((e) => {
        const h = hypotheses.find((x) => x.id === e.hypothesisId);
        return results
          .filter((r) => r.experimentId === e.id)
          .map((r) => (
            <div key={r.id} className="grid gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 text-sm md:grid-cols-2 shadow-2xs">
              <div>
                <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-slate-500">Hipótesis {h && `· ${HYPOTHESIS_STATUS_LABEL[h.status]}`}</p>
                <p className="mt-1 font-semibold text-slate-900">{h?.statement}</p>
                <p className="mt-2 text-[0.6875rem] uppercase tracking-[0.12em] text-slate-500">Criterios definidos antes</p>
                <p className="mt-1 text-slate-600">Éxito: {e.successCriterion}</p>
                <p className="text-slate-600">Rechazo: {e.rejectionCriterion}</p>
              </div>
              <div>
                <p className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.12em] text-slate-500">
                  Resultado <Tag color={r.outcome === "positive" ? "var(--color-ok)" : r.outcome === "negative" ? "var(--color-danger)" : "var(--color-highlight)"}>{OUTCOME_LABEL[r.outcome]}</Tag>
                </p>
                <p className="mt-1 font-semibold text-slate-900">{r.observed}</p>
                <p className="mt-1 text-slate-600">Métrica: {r.metricValue}</p>
                <p className="mt-1 text-slate-600">Aprendizaje: {r.learnings}</p>
                <p className="mt-1 text-slate-600">Limitaciones: {r.limitations}</p>
                <p className="mt-1 text-xs text-slate-400">{r.evidenceIds.length} evidencia(s) adjunta(s)</p>
              </div>
            </div>
          ));
      })}
    </div>
  );
}

