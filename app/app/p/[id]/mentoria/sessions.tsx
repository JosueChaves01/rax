"use client";

import { useEffect, useMemo, useState } from "react";
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
  SessionNote,
  SessionNoteKind,
} from "@/types/domain";
import {
  addNoteAction,
  adoptPostSessionCommitmentsAction,
  completeFirstReviewAction,
  completeSecondReviewAction,
  completeSessionAction,
  generatePostSessionSynthesisAction,
  generatePreSessionBriefingAction,
  requestReviewAction,
  scheduleSessionAction,
  setSharingAction,
} from "@/app/actions";
import {
  ACTION_TYPE_LABEL,
  DECISION_LABEL,
  HYPOTHESIS_STATUS_LABEL,
  NOTE_KIND_LABEL,
  OUTCOME_LABEL,
} from "@/features/labels";
import { Button, Card, Field, Notice, Tag, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { SessionCallPanel } from "@/shared/ui/session-call";

type People = Record<string, { id: string; name: string; role: string }>;

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
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<MentorSessionKind>("follow_up");
  const [scheduledDate, setScheduledDate] = useState("");

  const open = (k: MentorSession["kind"]) => sessions.some((s) => s.kind === k && s.status !== "completed");
  const done = (k: MentorSession["kind"]) => sessions.some((s) => s.kind === k && s.status === "completed");

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        scheduleSessionAction(projectId, {
          kind: scheduleKind,
          scheduledAt: scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
        }),
      () => {
        setShowScheduleModal(false);
        setScheduledDate("");
      },
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
        <p className="eyebrow text-slate-500">Sesiones y Revisiones</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowScheduleModal((v) => !v)}
        >
          {showScheduleModal ? "Cancelar" : "+ Agendar sesión"}
        </Button>
      </div>

      {showScheduleModal && (
        <form onSubmit={handleScheduleSubmit} className="rounded-xl border border-blue-200/90 bg-blue-50/50 p-4 space-y-3.5 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Nueva sesión de mentoría
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="sched-kind" label="Tipo de encuentro">
              <select
                id="sched-kind"
                className={inputClass}
                value={scheduleKind}
                onChange={(e) => setScheduleKind(e.target.value as MentorSessionKind)}
              >
                <option value="follow_up">Sesión de seguimiento y ejecución</option>
                <option value="exploratory">Sesión exploratoria de compatibilidad</option>
                <option value="first_review">Primera revisión de diagnóstico</option>
                <option value="second_review">Segunda revisión con resultados</option>
                <option value="evaluation">Evaluación de ciclo / Cierre</option>
              </select>
            </Field>

            <Field id="sched-date" label="Fecha y hora prevista (opcional)">
              <input
                id="sched-date"
                type="datetime-local"
                className={inputClass}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" type="button" onClick={() => setShowScheduleModal(false)}>
              Descartar
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={pending}>
              {pending ? "Agendando..." : "Confirmar sesión"}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3 text-sm">
        {only !== "second_review" && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50/60 border border-slate-200/60">
            <div>
              <span className="font-semibold text-slate-900">Primera revisión</span>
              {!summaryConfirmed && <span className="block text-xs text-slate-500 mt-0.5">Disponible al confirmar el resumen inicial.</span>}
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={pending || open("first_review") || done("first_review")}
              onClick={() => run(() => requestReviewAction(projectId, "first_review"))}
            >
              {done("first_review") ? "Hecha" : open("first_review") ? "Pedida" : "Pedir"}
            </Button>
          </div>
        )}

        {only !== "first_review" && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50/60 border border-slate-200/60">
            <div>
              <span className="font-semibold text-slate-900">Segunda revisión</span>
              {!hasResults && <span className="block text-xs text-slate-500 mt-0.5">Disponible cuando registres al menos un resultado.</span>}
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={pending || open("second_review")}
              onClick={() => run(() => requestReviewAction(projectId, "second_review"))}
            >
              {open("second_review") ? "Pedida" : "Pedir"}
            </Button>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function SessionCopilotBar({
  projectId,
  sessionId,
  disabled,
  onBriefingGenerated,
  onSynthesisGenerated,
}: {
  projectId: string;
  sessionId: string;
  disabled?: boolean;
  onBriefingGenerated: (briefing: PreSessionBriefing) => void;
  onSynthesisGenerated: (synthesis: PostSessionSynthesis) => void;
}) {
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateBriefing = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const res = await generatePreSessionBriefingAction(projectId, sessionId);
      if (res.ok) {
        if (res.data) {
          setAiNotice("Briefing estructurado en 4 capas generado y actualizado con el contexto actual.");
          onBriefingGenerated(res.data);
        }
      } else {
        setAiError(res.error || "No se pudo generar el briefing.");
      }
    } catch {
      setAiError("No se pudo conectar con el asistente de IA para el briefing.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleGenerateSynthesis = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const res = await generatePostSessionSynthesisAction(projectId, sessionId);
      if (res.ok) {
        if (res.data) {
          setAiNotice("Síntesis y compromisos generados a partir de las notas y contexto de la sesión.");
          onSynthesisGenerated(res.data);
        }
      } else {
        setAiError(res.error || "No se pudo generar la síntesis.");
      }
    } catch {
      setAiError("No se pudo conectar con el asistente de IA para la síntesis.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white p-5 space-y-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-white text-xs shadow-2xs">✨</span>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-900">
              Copiloto Metodológico de Sesiones
            </p>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
            Prepará la reunión con 4 capas de memoria o redactá la síntesis ejecutiva con compromisos en borrador en base al diagnóstico actual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            type="button"
            className="border-blue-300 text-blue-800 hover:bg-blue-50/80 font-semibold"
            disabled={isAiLoading || disabled}
            onClick={handleGenerateBriefing}
          >
            {isAiLoading ? "Procesando..." : "✨ Briefing 4 capas"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            className="border-blue-300 text-blue-800 hover:bg-blue-50/80 font-semibold"
            disabled={isAiLoading || disabled}
            onClick={handleGenerateSynthesis}
          >
            {isAiLoading ? "Procesando..." : "✨ Síntesis pos-sesión"}
          </Button>
        </div>
      </div>
      {aiNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2 text-xs text-emerald-800 font-medium">
          <span>✓</span>
          <span>{aiNotice}</span>
        </div>
      )}
      {aiError && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
          <span>⚠️</span>
          <span className="flex-1">{aiError}</span>
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
  isOwner?: boolean;
  items: Array<{ id: string; title: string }>;
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
  const canAct = props.isSessionMentor && s.status !== "completed";
  const canUseCopilot = (props.isSessionMentor || props.isOwner) && s.status !== "completed";
  const itemTitle = (id?: string) => props.items.find((i) => i.id === id)?.title;

  useEffect(() => {
    if (s.preSessionBriefing) setPreBrief(s.preSessionBriefing);
  }, [s.preSessionBriefing]);

  useEffect(() => {
    if (s.postSessionSynthesis) setPostSyn(s.postSessionSynthesis);
  }, [s.postSessionSynthesis]);

  const { run, pending } = useAction();
  const [onlySharedNotes, setOnlySharedNotes] = useState(false);

  const displayedNotes = useMemo(() => {
    if (onlySharedNotes) return props.notes.filter((n) => !n.isPrivate);
    return props.notes;
  }, [props.notes, onlySharedNotes]);

  const handleAdoptCommitments = (indices?: number[]) => {
    run(() => adoptPostSessionCommitmentsAction(props.projectId, s.id, indices));
  };

  return (
    <Card as="li" className="p-6 space-y-6 bg-white border border-slate-200/80 shadow-xs">
      {/* Cabecera de la tarjeta de sesión */}
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
        </div>
        <span className="text-xs text-slate-500">
          {props.people[s.mentorId]?.name ?? "Mentor"} · creada {formatDate(s.createdAt)}
        </span>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* COPILOTO METODOLÓGICO DE SESIONES                             */}
      {/* ───────────────────────────────────────────────────────────── */}
      {canUseCopilot && (
        <SessionCopilotBar
          projectId={props.projectId}
          sessionId={s.id}
          disabled={pending}
          onBriefingGenerated={(briefing) => {
            setPreBrief(briefing);
            router.refresh();
          }}
          onSynthesisGenerated={(synthesis) => {
            setPostSyn(synthesis);
            router.refresh();
          }}
        />
      )}

      {/* Llamada con transcripción (mentor de la sesión y equipo del proyecto) */}
      <SessionCallPanel sessionId={s.id} />

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. BRIEFING PRE-SESIÓN (4 CAPAS DE MEMORIA)                   */}
      {/* ───────────────────────────────────────────────────────────── */}
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

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. NOTAS EN VIVO Y PRIVACIDAD DUAL                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {props.notes.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow text-slate-500">Notas y acuerdos de la sesión ({displayedNotes.length})</p>
            {props.isSessionMentor && props.notes.some((n) => n.isPrivate) && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlySharedNotes}
                  onChange={(e) => setOnlySharedNotes(e.target.checked)}
                  className="rounded accent-blue-600"
                />
                <span>Ocultar notas privadas (vista del emprendedor)</span>
              </label>
            )}
          </div>

          <ul className="space-y-2.5">
            {displayedNotes.map((n) => (
              <li
                key={n.id}
                className={`rounded-xl border px-4 py-3 text-sm transition-colors ${
                  n.isPrivate
                    ? "border-purple-200 bg-purple-50/60"
                    : "border-slate-200/80 bg-white shadow-2xs"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-slate-500">
                  <Tag
                    color={
                      n.kind === "agreement"
                        ? "var(--color-ok)"
                        : n.kind === "commitment"
                          ? "var(--color-accent)"
                          : n.kind === "blocker"
                            ? "var(--color-danger)"
                            : n.kind === "decision"
                              ? "var(--color-highlight)"
                              : "var(--color-cyan)"
                    }
                  >
                    {NOTE_KIND_LABEL[n.kind]}
                  </Tag>
                  {n.isPrivate && (
                    <span className="rounded bg-purple-100 text-purple-800 px-2 py-0.5 font-semibold text-[0.625rem]">
                      🔒 Privada del mentor
                    </span>
                  )}
                  <span>{props.people[n.authorId]?.name} · {formatDate(n.createdAt)}</span>
                  {n.relatedItemId && <span>· sobre «{itemTitle(n.relatedItemId) ?? "elemento"}»</span>}
                </div>
                <p className="mt-1.5 text-slate-800 whitespace-pre-wrap leading-relaxed">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. SÍNTESIS POS-SESIÓN Y ADOPCIÓN DE COMPROMISOS              */}
      {/* ───────────────────────────────────────────────────────────── */}
      {postSyn && (
        <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/30 p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 pb-2.5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Síntesis Pos-Sesión · {formatDate(postSyn.generatedAt)}
              </p>
              <h4 className="font-bold text-slate-900">Resumen ejecutivo y compromisos formalizados</h4>
            </div>
            {(props.isSessionMentor || props.isOwner) && postSyn.entrepreneurCommitments.length > 0 && (
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() => handleAdoptCommitments()}
              >
                {pending ? "Adoptando..." : "✓ Adoptar compromisos en Hoja de Ruta"}
              </Button>
            )}
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
                  Compromisos del Emprendedor ({postSyn.entrepreneurCommitments.length})
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
      )}

      {/* Decisión del mentor (si aplica en segunda revisión) */}
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

      {!props.isSessionMentor && s.status !== "completed" && (
        <p className="text-sm text-slate-600">
          Mientras la sesión está abierta, podés registrar avances en la hoja de ruta y apoyarte en el copiloto metodológico para preparar las reuniones.
        </p>
      )}

      {/* Herramientas de interacción del mentor asignado */}
      {canAct && <MentorTools {...props} />}
    </Card>
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

function MentorTools({
  projectId,
  session: s,
  items,
  hypotheses,
}: {
  projectId: string;
  session: MentorSession;
  items: Array<{ id: string; title: string }>;
  hypotheses: Hypothesis[];
}) {
  const { run, pending, error } = useAction();
  const [kind, setKind] = useState<SessionNoteKind>("observation");
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [related, setRelated] = useState("");
  const [closing, setClosing] = useState("");
  const [decision, setDecision] = useState<MentorDecision>("continue");
  const decidable = hypotheses.filter((h) => !["draft", "pending_approval", "discarded", "reformulated"].includes(h.status));
  const [hyp, setHyp] = useState(decidable[0]?.id ?? "");

  const fid = (x: string) => `${s.id}-${x}`;

  return (
    <div className="space-y-5 border-t border-slate-200/80 pt-5">
      {/* Formulario de toma de notas en vivo con privacidad dual */}
      <form
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addNoteAction(projectId, s.id, kind, body, related || undefined, isPrivate),
            () => {
              setBody("");
              setIsPrivate(false);
            },
          );
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">Tomar nota en vivo</p>
          <label className="flex items-center gap-2 text-xs text-purple-700 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded accent-purple-600"
            />
            <span>🔒 Nota privada (no visible para el emprendedor)</span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={fid("k")} label="Categoría de la nota">
            <select
              id={fid("k")}
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as SessionNoteKind)}
            >
              {(Object.keys(NOTE_KIND_LABEL) as SessionNoteKind[]).map((k) => (
                <option key={k} value={k}>
                  {NOTE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field id={fid("rel")} label="Sobre (opcional)">
            <select id={fid("rel")} className={inputClass} value={related} onChange={(e) => setRelated(e.target.value)}>
              <option value="">Todo el proyecto</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field id={fid("b")} label={isPrivate ? "Contenido de la nota privada" : "Contenido de la nota compartida"}>
          <textarea
            id={fid("b")}
            rows={2}
            className={inputClass}
            placeholder={
              isPrivate
                ? "Reflexión o apunte privado del mentor para seguimiento posterior..."
                : "Acuerdo, compromiso, pregunta u observación visible para ambas partes..."
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            required
          />
        </Field>

        <div className="flex justify-end">
          <Button size="sm" variant="primary" type="submit" disabled={pending || !body.trim()}>
            {pending ? "Guardando..." : "Guardar nota"}
          </Button>
        </div>
      </form>

      {/* Cierre de sesión o registro de decisión */}
      <form
        className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            if (s.kind === "first_review") {
              return completeFirstReviewAction(projectId, s.id, closing);
            }
            if (s.kind === "second_review") {
              return completeSecondReviewAction(projectId, s.id, decision, closing, hyp);
            }
            const res = await completeSessionAction(projectId, s.id, closing || undefined);
            return res.ok ? { ok: true, data: undefined } : res;
          });
        }}
      >
        <p className="text-sm font-bold text-slate-900">
          {s.kind === "first_review"
            ? "Cerrar primera revisión con un acuerdo"
            : s.kind === "second_review"
              ? "Registrar decisión formal de la segunda revisión"
              : "Finalizar sesión de acompañamiento"}
        </p>

        {s.kind === "second_review" && (
          <>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Decisión</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DECISION_LABEL) as MentorDecision[]).map((k) => (
                  <label
                    key={k}
                    className="cursor-pointer rounded-full border border-slate-300 px-3.5 py-1 text-xs font-medium has-[:checked]:border-blue-600 has-[:checked]:bg-blue-600 has-[:checked]:text-white transition-colors"
                  >
                    <input
                      type="radio"
                      name={fid("dec")}
                      value={k}
                      className="sr-only"
                      checked={decision === k}
                      onChange={() => setDecision(k)}
                    />
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
          label={
            s.kind === "first_review"
              ? "Acuerdo explícito: qué investigar y prioridades iniciales"
              : s.kind === "second_review"
                ? "Justificación formal de la decisión"
                : "Acuerdos finales o resumen de cierre (opcional)"
          }
        >
          <textarea
            id={fid("c")}
            rows={2}
            className={inputClass}
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
            maxLength={2000}
            required={s.kind === "first_review" || s.kind === "second_review"}
          />
        </Field>

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="primary"
            type="submit"
            disabled={pending || (s.kind === "second_review" && !hyp)}
          >
            {s.kind === "first_review"
              ? "Completar primera revisión"
              : s.kind === "second_review"
                ? "Registrar decisión"
                : "Finalizar y archivar sesión"}
          </Button>
        </div>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
