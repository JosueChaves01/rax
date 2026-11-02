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
import { Button, Card, Field, Notice, Tag, cx, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { localIsoWithOffset, parseSessionDateTime } from "@/lib/dates";
import { SessionCallPanel } from "@/shared/ui/session-call";
import { NotesTab, useSessionWorkspace } from "@/shared/ui/session-tabs";
import { SynthesisEditor } from "./synthesis-editor";
import { AiNotesDraft } from "./ai-notes-draft";

type People = Record<string, { id: string; name: string; role: string }>;
export type ProblemOption = { id: string; title: string; priority?: { rank: number; rationale: string } };

const KIND_TITLE: Record<MentorSessionKind, string> = {
  first_review: "Primera revisión",
  second_review: "Segunda revisión",
  exploratory: "Sesión exploratoria",
  follow_up: "Sesión de seguimiento",
  evaluation: "Evaluación de ciclo",
};

const STATUS_TAG = {
  pending: ["Por confirmar", "var(--color-highlight)"],
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
 * Pedir la revisión de esta etapa (con la fecha y hora que prefiere la persona). Solo se muestra cuando
 * no hay una abierta: el mentor recibe el pedido con el briefing preparado y confirma la fecha.
 */
export function RequestReview({ projectId, kind, ready }: { projectId: string; kind: "first_review" | "second_review"; ready: boolean }) {
  const { run, pending, error } = useAction();
  const [date, setDate] = useState("");
  const isFirst = kind === "first_review";
  return (
    <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-5 shadow-xs sm:p-6">
      <p className="text-base font-bold text-slate-900">{isFirst ? "Pedí tu primera revisión" : "Pedí la segunda revisión"}</p>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        {!ready
          ? isFirst
            ? "Se habilita cuando confirmes el resumen inicial en el diagnóstico."
            : "Se habilita cuando registres al menos un resultado en Probar."
          : "Proponé fecha y hora. Tu mentor recibe el pedido con el briefing ya preparado y confirma la fecha o te propone otra."}
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Field id={`${kind}-date`} label="Fecha y hora (opcional)">
          <input id={`${kind}-date`} type="datetime-local" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} disabled={!ready} />
        </Field>
        <Button variant="primary" disabled={pending || !ready} onClick={() => run(() => requestReviewAction(projectId, kind, toIso(date)), () => setDate(""))}>
          {pending ? "Pidiendo..." : "Pedir revisión"}
        </Button>
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </div>
  );
}

/** Sesiones de seguimiento entre revisiones: un enlace discreto que se abre en un formulario corto. */
export function FollowUpRequest({ projectId }: { projectId: string }) {
  const { run, pending, error } = useAction();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
        + Agendar una sesión de seguimiento
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => scheduleSessionAction(projectId, { kind: "follow_up", scheduledAt: toIso(date) }),
          () => {
            setOpen(false);
            setDate("");
          },
        );
      }}
    >
      <Field id="follow-up-date" label="Sesión de seguimiento · fecha y hora">
        <input id="follow-up-date" type="datetime-local" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Button size="sm" variant="primary" type="submit" disabled={pending}>
        {pending ? "Agendando..." : "Agendar"}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
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

type Step = "prepare" | "meeting" | "close";

const STEPS: Array<[Step, string, string]> = [
  ["prepare", "1 · Preparar", "Fecha y briefing"],
  ["meeting", "2 · Reunión", "Llamada y notas"],
  ["close", "3 · Cierre", "Síntesis y acuerdo"],
];

/**
 * Una sesión del ciclo. Abierta, se trabaja en tres pasos (Preparar, Reunión, Cierre) en vez de una
 * pila larga; cerrada, se ve como un resumen con la síntesis, la decisión y las notas plegadas.
 */
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
  const [preBrief, setPreBrief] = useState<PreSessionBriefing | undefined>(s.preSessionBriefing);
  const [postSyn, setPostSyn] = useState<PostSessionSynthesis | undefined>(s.postSessionSynthesis);
  const [editingSyn, setEditingSyn] = useState(false);
  const [notesKey, setNotesKey] = useState(0);
  const isOpen = s.status !== "completed";
  const canAct = props.isSessionMentor && isOpen;
  const canEditSynthesis = Boolean(props.isSessionMentor || props.isOwner);
  const [step, setStep] = useState<Step>(() => (s.postSessionSynthesis ? "close" : s.confirmedAt ? "meeting" : "prepare"));

  useEffect(() => {
    if (s.preSessionBriefing) setPreBrief(s.preSessionBriefing);
  }, [s.preSessionBriefing]);

  useEffect(() => {
    if (s.postSessionSynthesis) {
      setPostSyn(s.postSessionSynthesis);
      setStep("close");
    }
  }, [s.postSessionSynthesis]);

  const stepDone: Record<Step, boolean> = { prepare: Boolean(s.confirmedAt), meeting: Boolean(postSyn), close: !isOpen };

  const synthesis = editingSyn ? (
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
  ) : canEditSynthesis && isOpen ? (
    <GenerateSynthesis
      projectId={props.projectId}
      sessionId={s.id}
      onGenerated={(syn) => {
        setPostSyn(syn);
        router.refresh();
      }}
      onWrite={() => setEditingSyn(true)}
    />
  ) : (
    <p className="text-sm text-slate-500">La síntesis aparece acá después de la llamada.</p>
  );

  const decision = s.decision && (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="eyebrow text-blue-700">Decisión del mentor</p>
      <p className="display mt-1 text-2xl text-slate-900">{DECISION_LABEL[s.decision.value]}</p>
      <p className="mt-1 text-sm text-slate-700">{s.decision.justification}</p>
      <p className="mt-1 text-xs text-slate-500">
        Sobre: {props.hypotheses.find((h) => h.id === s.decision!.hypothesisId)?.statement ?? "hipótesis"} · {formatDate(s.decision.decidedAt)}
      </p>
    </div>
  );

  return (
    <Card as="li" className="space-y-5 border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
      <SessionHeader session={s} people={props.people} />

      {!isOpen ? (
        <div className="space-y-4">
          {decision}
          {synthesis}
          <details className="rounded-xl border border-slate-200/80 p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Notas y preparación de la sesión</summary>
            <div className="mt-4 space-y-4">
              <Briefing session={s} preBrief={preBrief} open={false} />
              <SessionNotes projectId={props.projectId} sessionId={s.id} refreshKey={notesKey} />
            </div>
          </details>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Pasos de la sesión" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-100/80 p-1.5">
            {STEPS.map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={step === id}
                onClick={() => setStep(id)}
                className={cx(
                  "cursor-pointer rounded-xl px-2 py-2 text-left transition-colors sm:px-3",
                  step === id ? "bg-white shadow-2xs" : "hover:bg-white/60",
                )}
              >
                <span className={cx("flex items-center gap-1.5 text-xs font-bold", step === id ? "text-blue-700" : "text-slate-700")}>
                  {stepDone[id] && <span className="text-emerald-600" aria-label="hecho">✓</span>}
                  {label}
                </span>
                <span className="hidden text-[0.6875rem] text-slate-500 sm:block">{hint}</span>
              </button>
            ))}
          </div>

          {/* Los pasos quedan montados (ocultos) para no cortar una llamada al cambiar de pestaña. */}
          <div role="tabpanel" hidden={step !== "prepare"} className="space-y-4">
            {canAct && !s.confirmedAt && <ConfirmDate projectId={props.projectId} session={s} />}
            {!props.isSessionMentor && !s.confirmedAt && (
              <p className="text-sm text-slate-600">
                {s.scheduledAt ? "Tu mentor todavía no confirmó la fecha. Te avisamos acá cuando lo haga." : "Tu mentor va a proponer la fecha de la sesión."}
              </p>
            )}
            <Briefing
              session={s}
              preBrief={preBrief}
              open
              refresh={
                canAct ? (
                  <RefreshBriefing
                    projectId={props.projectId}
                    sessionId={s.id}
                    onDone={(briefing) => {
                      setPreBrief(briefing);
                      router.refresh();
                    }}
                  />
                ) : undefined
              }
            />
            {s.kind === "second_review" && <ResultsDigest hypotheses={props.hypotheses} experiments={props.experiments} results={props.results} />}
            <StepNext onClick={() => setStep("meeting")} label="Ir a la reunión" />
          </div>

          <div role="tabpanel" hidden={step !== "meeting"} className="space-y-4">
            <SessionCallPanel sessionId={s.id} />
            <SessionNotes projectId={props.projectId} sessionId={s.id} refreshKey={notesKey} />
            {canAct && <AiNotesDraft projectId={props.projectId} sessionId={s.id} items={props.items} onSaved={() => setNotesKey((k) => k + 1)} />}
            <StepNext onClick={() => setStep("close")} label="Ir al cierre" />
          </div>

          <div role="tabpanel" hidden={step !== "close"} className="space-y-4">
            {synthesis}
            {decision}
            {canAct ? (
              <ClosePanel
                projectId={props.projectId}
                session={s}
                synthesis={postSyn}
                problems={props.problems}
                hypotheses={props.hypotheses}
              />
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {props.isSessionMentor
                  ? "Esta sesión ya está cerrada."
                  : "Podés corregir la síntesis y responder las notas del mentor. Cuando tu mentor cierre la sesión, tus compromisos se vuelven tareas."}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function StepNext({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="flex justify-end">
      <button type="button" onClick={onClick} className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-blue-600 hover:text-blue-700">
        {label} →
      </button>
    </div>
  );
}

function SessionHeader({ session: s, people }: { session: MentorSession; people: People }) {
  const [statusLabel, statusColor] = STATUS_TAG[s.status];
  const isOpen = s.status !== "completed";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-slate-900">{KIND_TITLE[s.kind] ?? "Sesión de mentoría"}</h3>
          <Tag color={statusColor}>{statusLabel}</Tag>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Con {people[s.mentorId]?.name ?? "el mentor"} ·{" "}
          {s.scheduledAt ? (
            <>
              📅 {formatDate(s.scheduledAt)}
              {isOpen && (
                <span className={cx("ml-1.5 font-semibold", s.confirmedAt ? "text-emerald-700" : "text-amber-700")}>
                  {s.confirmedAt ? "· confirmada" : "· por confirmar"}
                </span>
              )}
            </>
          ) : isOpen ? (
            "sin fecha"
          ) : (
            `cerrada ${formatDate(s.completedAt ?? s.createdAt)}`
          )}
        </p>
      </div>
    </div>
  );
}

/** Un solo briefing: el que preparó la IA si existe; si no, el resumen estructurado del diagnóstico. */
function Briefing({ session: s, preBrief, open, refresh }: { session: MentorSession; preBrief?: PreSessionBriefing; open: boolean; refresh?: React.ReactNode }) {
  const b = s.briefing;
  if (!preBrief && !b) return refresh ? <div>{refresh}</div> : null;
  return (
    <details className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5" open={open}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700">
        <span>Briefing · {formatDate((preBrief ?? b)!.generatedAt)}</span>
        {refresh}
      </summary>
      {preBrief ? (
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <BriefBlock label="Acuerdos y objetivos vigentes" text={preBrief.activeAgreementsAndGoalsSummary} />
          <BriefBlock label="Avance, problemas y bloqueos" text={preBrief.recentProgressSummary} />
          <BriefBlock label="Temas pendientes" text={preBrief.pendingTopicsSummary} wide />
          <BriefList label="Agenda propuesta" items={preBrief.suggestedAgenda} />
          <BriefList label="Preguntas para la sesión" items={preBrief.suggestedQuestions.map((q) => `«${q}»`)} />
        </div>
      ) : (
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <Brief label="Qué intenta desarrollar" value={b!.whatTheyBuild} />
          <Brief label="Etapa" value={b!.stage} />
          <Brief label="Problema principal" value={b!.mainProblem} />
          <Brief label="Evidencia" list={b!.evidence} empty="Sin evidencia registrada." />
          <Brief label="Supuestos sin comprobar" list={b!.openAssumptions} empty="Ninguno registrado." />
          <Brief label="Recursos y limitaciones" list={b!.resourcesAndLimits} empty="Sin datos." />
          <Brief label="Preguntas que requieren criterio humano" list={b!.questionsForMentor} empty="Ninguna." />
        </dl>
      )}
    </details>
  );
}

function BriefBlock({ label, text, wide }: { label: string; text: string; wide?: boolean }) {
  return (
    <div className={cx("rounded-xl border border-slate-200/80 bg-white p-4", wide && "md:col-span-2")}>
      <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{text}</p>
    </div>
  );
}

function BriefList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4">
      <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-800">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
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
  problems,
  hypotheses,
}: {
  projectId: string;
  session: MentorSession;
  synthesis?: PostSessionSynthesis;
  problems: ProblemOption[];
  hypotheses: Hypothesis[];
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
    <div>
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
                Síntesis de la sesión · {formatDate(postSyn.generatedAt)}
              </p>
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
                Decisiones y acuerdos
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
                  Compromisos del emprendedor ({postSyn.entrepreneurCommitments.length}){postSyn.commitmentsAdoptedAt ? " · ya son tareas" : ""}
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
                  Compromisos del mentor ({postSyn.mentorCommitments.length})
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

