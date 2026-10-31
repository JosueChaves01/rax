"use client";

import { useState } from "react";
import type {
  AgreementFrequency,
  CompatibilityStatus,
  GoalKind,
  GoalPriority,
  GoalStatus,
  MentorshipStage,
  Profile,
} from "@/types/domain";
import type { Workspace } from "@/lib/services/projects";
import {
  confirmMentorshipAgreementAction,
  createMentorshipGoalAction,
  decideCompatibilityAction,
  initiateMentorshipRelationAction,
  saveMentorshipAgreementAction,
  suggestGoalsAndAgreementAction,
  transitionMentorshipStageAction,
  updateMentorshipGoalStatusAction,
} from "@/app/actions";
import {
  AGREEMENT_FREQUENCY_LABEL,
  AGREEMENT_STATUS_LABEL,
  COMPATIBILITY_STATUS_LABEL,
  GOAL_KIND_LABEL,
  GOAL_PRIORITY_LABEL,
  GOAL_STATUS_LABEL,
  MENTORSHIP_STAGE_LABEL,
} from "@/features/labels";
import { Button, Card, Empty, Field, Notice, Tag, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import type { GoalsSuggestion, SuggestedGoal } from "@/lib/ai/schema";

interface AgreementsUIProps {
  projectId: string;
  workspace: Workspace;
  actor: Profile;
}

export function AgreementsUI({ projectId, workspace: w, actor }: AgreementsUIProps) {
  const rel = w.mentorshipRelation;
  const agreements = w.mentorshipAgreements ?? [];
  const goals = w.mentorshipGoals ?? [];
  const latestAgreement = agreements[agreements.length - 1];

  const perms = w.permissions;
  const canManageMentorship = !!perms["mentorship.manage"];
  const canEditAgreement = !!perms["agreement.edit"];
  const canConfirmAgreement = !!perms["agreement.confirm"];
  const canManageGoal = !!perms["goal.manage"];
  const isMentor = actor.id === rel?.mentorId;
  const isEntrepreneur = actor.id === rel?.entrepreneurId;

  // Estados de modales y formularios
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineRationale, setDeclineRationale] = useState("");

  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [agreementForm, setAgreementForm] = useState({
    frequency: (latestAgreement?.frequency ?? "biweekly") as AgreementFrequency,
    sessionDurationMinutes: latestAgreement?.sessionDurationMinutes ?? 60,
    authorizedChannels: latestAgreement?.authorizedChannels?.join(", ") ?? "Google Meet, WhatsApp",
    scope:
      latestAgreement?.scope ??
      "Acompañamiento metodológico para validar propuesta de valor, revisar métricas y priorizar experimentos.",
    mentorCommitments:
      latestAgreement?.mentorCommitments ??
      "Preparar cada sesión, puntualidad, devoluciones constructivas en menos de 48h y confidencialidad.",
    entrepreneurCommitments:
      latestAgreement?.entrepreneurCommitments ??
      "Actualizar avances 24h antes de cada sesión, transparencia en métricas y ejecución de compromisos acordados.",
    confidentialityTerms:
      latestAgreement?.confidentialityTerms ??
      "Confidencialidad recíproca respecto a métricas, clientes y estrategia.",
    expectedDurationWeeks: latestAgreement?.expectedDurationWeeks ?? 12,
  });

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: "",
    description: "",
    whyItMatters: "",
    kind: "qualitative" as GoalKind,
    baseline: "",
    targetResult: "",
    metricIndicator: "",
    priority: "medium" as GoalPriority,
  });

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<GoalsSuggestion | null>(null);

  const action = useAction();

  // Handlers
  function handleInitiateRelation(mentorId: string) {
    action.run(async () => {
      return initiateMentorshipRelationAction(projectId, w.project.ownerId, mentorId);
    });
  }

  function handleDecideCompatibility(status: CompatibilityStatus, rationale?: string) {
    if (!rel) return;
    action.run(async () => {
      return decideCompatibilityAction(projectId, rel.id, status, rationale);
    }, () => {
      setShowDeclineModal(false);
      setDeclineRationale("");
    });
  }

  function handleTransitionStage(nextStage: MentorshipStage) {
    if (!rel) return;
    action.run(async () => {
      return transitionMentorshipStageAction(projectId, rel.id, nextStage);
    });
  }

  function handleSaveAgreement(e: React.FormEvent) {
    e.preventDefault();
    if (!rel) return;
    action.run(
      async () => {
        return saveMentorshipAgreementAction(projectId, rel.id, {
          frequency: agreementForm.frequency,
          sessionDurationMinutes: Number(agreementForm.sessionDurationMinutes),
          authorizedChannels: agreementForm.authorizedChannels
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          scope: agreementForm.scope,
          mentorCommitments: agreementForm.mentorCommitments,
          entrepreneurCommitments: agreementForm.entrepreneurCommitments,
          confidentialityTerms: agreementForm.confidentialityTerms,
          expectedDurationWeeks: Number(agreementForm.expectedDurationWeeks),
        });
      },
      () => {
        setShowAgreementForm(false);
      },
    );
  }

  function handleConfirmAgreement(agreementId: string) {
    action.run(async () => {
      return confirmMentorshipAgreementAction(projectId, agreementId);
    });
  }

  function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!rel) return;
    action.run(
      async () => {
        return createMentorshipGoalAction(projectId, rel.id, {
          title: goalForm.title,
          description: goalForm.description,
          whyItMatters: goalForm.whyItMatters,
          kind: goalForm.kind,
          baseline: goalForm.baseline,
          targetResult: goalForm.targetResult,
          metricIndicator: goalForm.metricIndicator || undefined,
          priority: goalForm.priority,
        });
      },
      () => {
        setShowGoalForm(false);
        setGoalForm({
          title: "",
          description: "",
          whyItMatters: "",
          kind: "qualitative",
          baseline: "",
          targetResult: "",
          metricIndicator: "",
          priority: "medium",
        });
      },
    );
  }

  function handleUpdateGoalStatus(goalId: string, status: GoalStatus) {
    action.run(async () => {
      return updateMentorshipGoalStatusAction(projectId, goalId, status);
    });
  }

  function handleRequestAiSuggestions() {
    if (!rel) return;
    setAiModalOpen(true);
    action.run(
      async () => {
        return suggestGoalsAndAgreementAction(projectId, rel.id);
      },
      (res) => {
        if ("data" in res && res.data?.suggestion) {
          setAiSuggestions(res.data.suggestion);
        }
      },
    );
  }

  function handleAdoptSuggestedGoal(sug: SuggestedGoal) {
    if (!rel) return;
    action.run(async () => {
      return createMentorshipGoalAction(projectId, rel.id, {
        title: sug.title,
        description: sug.description,
        whyItMatters: sug.whyItMatters,
        kind: sug.kind,
        baseline: sug.baseline,
        targetResult: sug.targetResult,
        metricIndicator: sug.metricIndicator,
        priority: sug.priority,
      });
    });
  }

  function handleApplySuggestedTerms() {
    if (!aiSuggestions?.suggestedAgreementTerms) return;
    const t = aiSuggestions.suggestedAgreementTerms;
    setAgreementForm({
      frequency: t.frequency,
      sessionDurationMinutes: t.sessionDurationMinutes,
      authorizedChannels: t.authorizedChannels.join(", "),
      scope: t.scope,
      mentorCommitments: t.mentorCommitments,
      entrepreneurCommitments: t.entrepreneurCommitments,
      confidentialityTerms: t.confidentialityTerms,
      expectedDurationWeeks: t.expectedDurationWeeks,
    });
    setShowAgreementForm(true);
    setAiModalOpen(false);
  }

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div>
        <p className="eyebrow">Etapa 2 · Orientar</p>
        <h2 className="display mt-2 text-4xl">
          Acuerdos y <span className="text-highlight">objetivos de mentoría.</span>
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          RAX estructura el acompañamiento sobre acuerdos claros y criterios compartidos: evaluamos la afinidad mutua,
          formalizamos los compromisos de trabajo bilateral y fijamos objetivos con su línea base actual documentada y
          resultados observables.
        </p>
      </div>

      {action.error && (
        <Notice tone="error">
          <p>{action.error}</p>
        </Notice>
      )}

      {/* ── BLOQUE 1: Exploración y Compatibilidad ── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Etapa 1 del proceso</span>
            <h3 className="display text-xl text-slate-900">Relación y evaluación de compatibilidad</h3>
          </div>
          {rel && (
            <div className="flex items-center gap-2">
              <Tag color="var(--color-cyan)">{MENTORSHIP_STAGE_LABEL[rel.stage]}</Tag>
              <Tag
                color={
                  rel.compatibilityStatus === "proceed"
                    ? "var(--color-ok)"
                    : rel.compatibilityStatus === "declined"
                      ? "var(--color-danger)"
                      : "var(--color-highlight)"
                }
              >
                {COMPATIBILITY_STATUS_LABEL[rel.compatibilityStatus]}
              </Tag>
            </div>
          )}
        </div>

        {!rel ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">
              Todavía no se ha formalizado una relación de mentoría en RAX para este proyecto.
            </p>
            {w.mentors.length > 0 ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  disabled={action.pending || !canManageMentorship}
                  onClick={() => handleInitiateRelation(w.mentors[0])}
                >
                  Iniciar relación de mentoría con {w.people[w.mentors[0]]?.name ?? "mentor/a"}
                </Button>
              </div>
            ) : (
              <Notice tone="info">
                El proyecto todavía no tiene mentor/a asignado/a. Podés solicitar acompañamiento desde la pantalla de
                diagnóstico.
              </Notice>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {rel.compatibilityStatus === "pending" && (
              <div className="rounded-xl border border-highlight/30 bg-highlight/5 p-4">
                <p className="text-sm text-slate-900">
                  <strong>Evaluación mutua en curso:</strong> Antes de fijar compromisos formales, ambas partes verifican
                  que haya química de trabajo, disponibilidad real de tiempo y expectativas equilibradas. Si alguna de las
                  dos partes siente que no es el momento o perfil adecuado, se puede declinar con respeto sin forzar el
                  proceso.
                </p>
                {canManageMentorship && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      variant="primary"
                      disabled={action.pending}
                      onClick={() => handleDecideCompatibility("proceed")}
                    >
                      ✓ Confirmar compatibilidad y avanzar a diagnóstico
                    </Button>
                    <Button
                      variant="danger"
                      disabled={action.pending}
                      onClick={() => setShowDeclineModal(true)}
                    >
                      Declinar proceso
                    </Button>
                  </div>
                )}
              </div>
            )}

            {rel.compatibilityStatus === "proceed" && (
              <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
                <div>
                  <p className="text-slate-900">
                    ✓ Compatibilidad mutua confirmada el {formatDate(rel.compatibilityDecidedAt ?? rel.updatedAt)}.
                  </p>
                  {rel.compatibilityRationale && (
                    <p className="mt-1 text-xs text-muted">Motivo / nota: «{rel.compatibilityRationale}»</p>
                  )}
                </div>

                {canManageMentorship && rel.stage === "diagnosis" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={action.pending}
                    onClick={() => handleTransitionStage("agreement")}
                  >
                    Avanzar a etapa de acuerdos →
                  </Button>
                )}
                {canManageMentorship && rel.stage === "agreement" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={action.pending}
                    onClick={() => handleTransitionStage("active_mentoring")}
                  >
                    Avanzar a acompañamiento activo →
                  </Button>
                )}
              </div>
            )}

            {rel.compatibilityStatus === "declined" && (
              <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
                <p className="text-sm font-semibold text-danger">El proceso de mentoría fue declinado.</p>
                {rel.compatibilityRationale && (
                  <p className="mt-1 text-sm text-muted">Motivo expresado: «{rel.compatibilityRationale}»</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Modal para declinar */}
      {showDeclineModal && (
        <Card className="border-danger/40 bg-slate-50 p-6">
          <h4 className="text-base font-semibold text-danger">Declinar proceso de mentoría</h4>
          <p className="mt-1 text-xs text-muted">
            Declinar con respeto permite al emprendedor buscar un mentor con mayor afinidad sin desgastar expectativas.
          </p>
          <div className="mt-3">
            <Field label="Motivo o devolución constructiva (opcional)" id="decline-rationale">
              <textarea
                id="decline-rationale"
                rows={3}
                className={inputClass}
                placeholder="Ej: El proyecto requiere especialización técnica en biotecnología que excede mi experiencia actual..."
                value={declineRationale}
                onChange={(e) => setDeclineRationale(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-4 flex gap-3">
            <Button
              variant="danger"
              disabled={action.pending}
              onClick={() => handleDecideCompatibility("declined", declineRationale)}
            >
              Confirmar y cerrar relación
            </Button>
            <Button variant="ghost" onClick={() => setShowDeclineModal(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* ── BLOQUE 2: Acuerdo Bilateral de Mentoría ── */}
      {rel && rel.compatibilityStatus === "proceed" && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Pacto operativo</span>
              <h3 className="display text-xl text-slate-900">Acuerdo de mentoría</h3>
            </div>
            {latestAgreement && (
              <div className="flex items-center gap-2">
                <Tag color="var(--color-muted)">Versión {latestAgreement.version}</Tag>
                <Tag
                  color={
                    latestAgreement.status === "active"
                      ? "var(--color-ok)"
                      : latestAgreement.status.startsWith("confirmed")
                        ? "var(--color-highlight)"
                        : "var(--color-faint)"
                  }
                >
                  {AGREEMENT_STATUS_LABEL[latestAgreement.status]}
                </Tag>
              </div>
            )}
          </div>

          {!latestAgreement && !showAgreementForm ? (
            <div className="mt-6 text-center">
              <p className="text-sm text-muted">
                Aún no se ha redactado el acuerdo de mentoría. Establezcan las reglas de juego mutuas.
              </p>
              {canEditAgreement && (
                <div className="mt-4 flex justify-center gap-3">
                  <Button variant="primary" onClick={() => setShowAgreementForm(true)}>
                    Redactar acuerdo inicial
                  </Button>
                  <Button variant="secondary" onClick={handleRequestAiSuggestions}>
                    ✨ Sugerir con IA
                  </Button>
                </div>
              )}
            </div>
          ) : showAgreementForm ? (
            <form onSubmit={handleSaveAgreement} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frecuencia de sesiones" id="agr-freq">
                  <select
                    id="agr-freq"
                    className={inputClass}
                    value={agreementForm.frequency}
                    onChange={(e) => setAgreementForm({ ...agreementForm, frequency: e.target.value as AgreementFrequency })}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="on_demand">A demanda</option>
                  </select>
                </Field>
                <Field label="Duración por sesión (minutos)" id="agr-duration">
                  <input
                    id="agr-duration"
                    type="number"
                    min={15}
                    max={240}
                    className={inputClass}
                    value={agreementForm.sessionDurationMinutes}
                    onChange={(e) => setAgreementForm({ ...agreementForm, sessionDurationMinutes: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Canales de comunicación oficiales (separados por coma)" id="agr-channels">
                  <input
                    id="agr-channels"
                    type="text"
                    className={inputClass}
                    placeholder="Google Meet, WhatsApp, Email"
                    value={agreementForm.authorizedChannels}
                    onChange={(e) => setAgreementForm({ ...agreementForm, authorizedChannels: e.target.value })}
                  />
                </Field>
                <Field label="Duración estimada del ciclo (semanas)" id="agr-weeks">
                  <input
                    id="agr-weeks"
                    type="number"
                    min={1}
                    max={52}
                    className={inputClass}
                    value={agreementForm.expectedDurationWeeks}
                    onChange={(e) => setAgreementForm({ ...agreementForm, expectedDurationWeeks: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <Field
                label="Alcance del acompañamiento (qué abarca y qué NO abarca)"
                id="agr-scope"
                hint="Distingue explícitamente la orientación metodológica de la ejecución operativa directa o asesoría legal vinculante."
              >
                <textarea
                  id="agr-scope"
                  rows={3}
                  className={inputClass}
                  value={agreementForm.scope}
                  onChange={(e) => setAgreementForm({ ...agreementForm, scope: e.target.value })}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Compromisos del mentor/a" id="agr-mentor-commit">
                  <textarea
                    id="agr-mentor-commit"
                    rows={3}
                    className={inputClass}
                    value={agreementForm.mentorCommitments}
                    onChange={(e) => setAgreementForm({ ...agreementForm, mentorCommitments: e.target.value })}
                  />
                </Field>
                <Field label="Compromisos del emprendedor/a" id="agr-ent-commit">
                  <textarea
                    id="agr-ent-commit"
                    rows={3}
                    className={inputClass}
                    value={agreementForm.entrepreneurCommitments}
                    onChange={(e) => setAgreementForm({ ...agreementForm, entrepreneurCommitments: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Términos de confidencialidad recíproca" id="agr-confidentiality">
                <textarea
                  id="agr-confidentiality"
                  rows={2}
                  className={inputClass}
                  value={agreementForm.confidentialityTerms}
                  onChange={(e) => setAgreementForm({ ...agreementForm, confidentialityTerms: e.target.value })}
                />
              </Field>

              <div className="flex gap-3 pt-2">
                <Button variant="primary" type="submit" disabled={action.pending}>
                  Guardar borrador de acuerdo
                </Button>
                <Button variant="ghost" type="button" onClick={() => setShowAgreementForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Tarjetas resumen */}
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">Frecuencia</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{AGREEMENT_FREQUENCY_LABEL[latestAgreement.frequency]}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">Duración sesión</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{latestAgreement.sessionDurationMinutes} min</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">Canales</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{latestAgreement.authorizedChannels.join(", ")}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">Ciclo estimado</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{latestAgreement.expectedDurationWeeks} semanas</p>
                </div>
              </div>

              {/* Textos del acuerdo */}
              <div className="space-y-3 text-sm">
                <div>
                  <h4 className="font-semibold text-slate-900">Alcance del acompañamiento:</h4>
                  <p className="mt-1 text-muted whitespace-pre-wrap">{latestAgreement.scope}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h5 className="font-semibold text-slate-900">Compromisos del mentor/a</h5>
                    <p className="mt-1 text-xs text-muted whitespace-pre-wrap">{latestAgreement.mentorCommitments}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h5 className="font-semibold text-slate-900">Compromisos del emprendedor/a</h5>
                    <p className="mt-1 text-xs text-muted whitespace-pre-wrap">{latestAgreement.entrepreneurCommitments}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900">Confidencialidad:</h4>
                  <p className="mt-1 text-xs text-muted whitespace-pre-wrap">{latestAgreement.confidentialityTerms}</p>
                </div>
              </div>

              {/* Estado de confirmación bilateral */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Confirmación bilateral</p>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1">
                        Mentor/a:{" "}
                        {latestAgreement.status === "confirmed_by_mentor" || latestAgreement.status === "active" ? (
                          <strong className="text-ok">✓ Confirmado</strong>
                        ) : (
                          <span className="text-muted">Pendiente</span>
                        )}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        Emprendedor/a:{" "}
                        {latestAgreement.status === "confirmed_by_entrepreneur" || latestAgreement.status === "active" ? (
                          <strong className="text-ok">✓ Confirmado</strong>
                        ) : (
                          <span className="text-muted">Pendiente</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {canEditAgreement && latestAgreement.status !== "active" && (
                      <Button variant="ghost" size="sm" onClick={() => setShowAgreementForm(true)}>
                        Editar términos
                      </Button>
                    )}

                    {canConfirmAgreement && latestAgreement.status !== "active" && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={action.pending}
                        onClick={() => handleConfirmAgreement(latestAgreement.id)}
                      >
                        {isMentor
                          ? "Confirmar como mentor/a"
                          : isEntrepreneur
                            ? "Confirmar como emprendedor/a"
                            : "Confirmar acuerdo"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── BLOQUE 3: Objetivos de Mentoría ── */}
      {rel && rel.compatibilityStatus === "proceed" && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Resultados observables</span>
              <h3 className="display text-xl text-slate-900">Objetivos del ciclo ({goals.length})</h3>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={handleRequestAiSuggestions} disabled={action.pending}>
                ✨ Sugerir con IA
              </Button>
              {canManageGoal && (
                <Button variant="primary" size="sm" onClick={() => setShowGoalForm(!showGoalForm)}>
                  {showGoalForm ? "Cerrar formulario" : "+ Nuevo objetivo"}
                </Button>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-muted">
            Principio RAX: <strong>No todos los problemas necesitan experimentos.</strong> Los objetivos pueden ser métricas,
            mejoras cualitativas verificables, adquisición de capacidades o decisiones estratégicas clave. Cada objetivo
            debe documentar su línea base actual y su resultado esperado observable.
          </p>

          {/* Formulario nuevo objetivo */}
          {showGoalForm && (
            <form onSubmit={handleCreateGoal} className="mt-6 space-y-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
              <h4 className="font-semibold text-slate-900">Registrar nuevo objetivo de mentoría</h4>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Field label="Título del objetivo" id="goal-title">
                    <input
                      id="goal-title"
                      type="text"
                      className={inputClass}
                      placeholder="Ej: Validar la propuesta de valor con clientes recurrentes"
                      value={goalForm.title}
                      onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                      required
                    />
                  </Field>
                </div>
                <Field label="Tipo de objetivo" id="goal-kind">
                  <select
                    id="goal-kind"
                    className={inputClass}
                    value={goalForm.kind}
                    onChange={(e) => setGoalForm({ ...goalForm, kind: e.target.value as GoalKind })}
                  >
                    <option value="qualitative">Cualitativo</option>
                    <option value="capability">Desarrollo de capacidad</option>
                    <option value="strategic">Decisión estratégica</option>
                    <option value="metric">Métrica observable</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Descripción de lo que se busca lograr" id="goal-desc">
                  <textarea
                    id="goal-desc"
                    rows={2}
                    className={inputClass}
                    placeholder="Detalle de actividades o enfoque..."
                    value={goalForm.description}
                    onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
                  />
                </Field>
                <Field label="Por qué es importante en esta etapa" id="goal-why">
                  <textarea
                    id="goal-why"
                    rows={2}
                    className={inputClass}
                    placeholder="Consecuencia o relevancia metodológica..."
                    value={goalForm.whyItMatters}
                    onChange={(e) => setGoalForm({ ...goalForm, whyItMatters: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Línea base actual documentada (obligatoria)"
                  id="goal-baseline"
                  hint="Qué evidencia o situación real existe hoy antes de la intervención (hechos documentados)."
                >
                  <textarea
                    id="goal-baseline"
                    rows={2}
                    className={inputClass}
                    placeholder="Ej: Actualmente 0 clientes pagan recurrentemente y la cobranza es 100% manual..."
                    value={goalForm.baseline}
                    onChange={(e) => setGoalForm({ ...goalForm, baseline: e.target.value })}
                    required
                  />
                </Field>
                <Field
                  label="Resultado esperado observable (obligatorio)"
                  id="goal-target"
                  hint="Criterio de éxito contrastable contra la realidad al terminar el ciclo (sin tautologías de éxito)."
                >
                  <textarea
                    id="goal-target"
                    rows={2}
                    className={inputClass}
                    placeholder="Ej: Al menos 5 clientes pagan vía suscripción mensual automática..."
                    value={goalForm.targetResult}
                    onChange={(e) => setGoalForm({ ...goalForm, targetResult: e.target.value })}
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {goalForm.kind === "metric" && (
                  <Field label="Indicador numérico específico" id="goal-metric">
                    <input
                      id="goal-metric"
                      type="text"
                      className={inputClass}
                      placeholder="Ej: Cantidad de suscriptores activos"
                      value={goalForm.metricIndicator}
                      onChange={(e) => setGoalForm({ ...goalForm, metricIndicator: e.target.value })}
                    />
                  </Field>
                )}
                <Field label="Prioridad" id="goal-priority">
                  <select
                    id="goal-priority"
                    className={inputClass}
                    value={goalForm.priority}
                    onChange={(e) => setGoalForm({ ...goalForm, priority: e.target.value as GoalPriority })}
                  >
                    <option value="high">Alta</option>
                    <option value="medium">Media</option>
                    <option value="low">Baja</option>
                  </select>
                </Field>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="primary" type="submit" disabled={action.pending}>
                  Guardar objetivo
                </Button>
                <Button variant="ghost" type="button" onClick={() => setShowGoalForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}

          {/* Listado de objetivos */}
          {goals.length === 0 ? (
            <div className="mt-6">
              <Empty title="Sin objetivos definidos">
                Comiencen pactando de 2 a 4 objetivos clave para este ciclo de mentoría.
              </Empty>
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {goals.map((g) => (
                <li key={g.id} className="rounded-xl border border-slate-200 bg-slate-50 p-5 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag
                          color={
                            g.kind === "metric"
                              ? "var(--color-cyan)"
                              : g.kind === "capability"
                                ? "var(--color-ok)"
                                : g.kind === "strategic"
                                  ? "var(--color-highlight)"
                                  : "var(--color-muted)"
                          }
                        >
                          {GOAL_KIND_LABEL[g.kind]}
                        </Tag>
                        <Tag
                          color={
                            g.priority === "high"
                              ? "var(--color-danger)"
                              : g.priority === "medium"
                                ? "var(--color-highlight)"
                                : "var(--color-faint)"
                          }
                        >
                          Prioridad {GOAL_PRIORITY_LABEL[g.priority]}
                        </Tag>
                        <Tag
                          color={
                            g.status === "achieved"
                              ? "var(--color-ok)"
                              : g.status === "partially_achieved" ? "var(--color-highlight)" : g.status === "deferred"
                                ? "var(--color-faint)"
                                : g.status === "discarded"
                                  ? "var(--color-danger)"
                                  : "var(--color-cyan)"
                          }
                        >
                          {GOAL_STATUS_LABEL[g.status]}
                        </Tag>
                      </div>
                      <h4 className="mt-2 text-base font-semibold text-slate-900">{g.title}</h4>
                      {g.description && <p className="mt-1 text-xs text-muted">{g.description}</p>}
                    </div>

                    {canManageGoal && (
                      <div className="flex items-center gap-2">
                        {g.status !== "achieved" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={action.pending}
                            onClick={() => handleUpdateGoalStatus(g.id, "achieved")}
                          >
                            ✓ Marcar logrado
                          </Button>
                        )}
                        {g.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={action.pending}
                            onClick={() => handleUpdateGoalStatus(g.id, "deferred")}
                          >
                            Postergar
                          </Button>
                        )}
                        {g.status === "deferred" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={action.pending}
                            onClick={() => handleUpdateGoalStatus(g.id, "active")}
                          >
                            Reanudar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Línea base y resultado esperado */}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                        Línea base actual (hechos documentados)
                      </p>
                      <p className="mt-1 text-xs text-slate-900">{g.baseline}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200/60 bg-slate-50 p-3">
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
                        Resultado esperado observable
                      </p>
                      <p className="mt-1 text-xs text-slate-900">{g.targetResult}</p>
                    </div>
                  </div>

                  {g.whyItMatters && (
                    <p className="mt-2 text-xs text-muted">
                      <em>Por qué importa:</em> {g.whyItMatters}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ── MODAL / DRAWER: Asistente de IA para sugerir objetivos y términos ── */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-highlight">
                  Asistente metodológico RAX
                </span>
                <h3 className="display text-xl text-slate-900">Sugerencias de objetivos y términos</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAiModalOpen(false)}>
                ✕ Cerrar
              </Button>
            </div>

            {action.pending && !aiSuggestions ? (
              <div className="py-12 text-center">
                <p className="text-sm text-slate-900 animate-pulse">
                  Analizando el diagnóstico confirmado, notas del mentor y problemas priorizados...
                </p>
                <p className="mt-1 text-xs text-muted">
                  RAX distingue supuestos de evidencias para formular metas observables y términos realistas.
                </p>
              </div>
            ) : aiSuggestions ? (
              <div className="mt-6 space-y-6">
                {aiSuggestions.rationale && (
                  <Notice tone="info">
                    <p className="text-xs">{aiSuggestions.rationale}</p>
                  </Notice>
                )}

                {/* Términos de acuerdo sugeridos */}
                {aiSuggestions.suggestedAgreementTerms && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Términos sugeridos para el acuerdo</h4>
                      {canEditAgreement && (
                        <Button variant="secondary" size="sm" onClick={handleApplySuggestedTerms}>
                          Aplicar términos al acuerdo
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                      <p>
                        <strong>Frecuencia:</strong> {AGREEMENT_FREQUENCY_LABEL[aiSuggestions.suggestedAgreementTerms.frequency]}
                      </p>
                      <p>
                        <strong>Duración:</strong> {aiSuggestions.suggestedAgreementTerms.sessionDurationMinutes} min
                      </p>
                      <p>
                        <strong>Canales:</strong> {aiSuggestions.suggestedAgreementTerms.authorizedChannels.join(", ")}
                      </p>
                      <p>
                        <strong>Semanas:</strong> {aiSuggestions.suggestedAgreementTerms.expectedDurationWeeks} semanas
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      <strong>Alcance:</strong> {aiSuggestions.suggestedAgreementTerms.scope}
                    </p>
                  </div>
                )}

                {/* Objetivos sugeridos */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Objetivos sugeridos ({aiSuggestions.suggestedGoals.length})
                  </h4>
                  <ul className="space-y-3">
                    {aiSuggestions.suggestedGoals.map((sug, idx) => (
                      <li key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <Tag color="var(--color-cyan)">{GOAL_KIND_LABEL[sug.kind]}</Tag>
                              <Tag color="var(--color-highlight)">Prioridad {GOAL_PRIORITY_LABEL[sug.priority]}</Tag>
                            </div>
                            <h5 className="mt-1.5 text-sm font-semibold text-slate-900">{sug.title}</h5>
                            <p className="mt-1 text-xs text-muted">{sug.description}</p>
                          </div>
                          {canManageGoal && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={action.pending}
                              onClick={() => handleAdoptSuggestedGoal(sug)}
                            >
                              + Adoptar objetivo
                            </Button>
                          )}
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                          <div className="rounded bg-white p-2">
                            <span className="font-semibold text-muted">Línea base:</span>
                            <p className="text-slate-900">{sug.baseline}</p>
                          </div>
                          <div className="rounded bg-white p-2">
                            <span className="font-semibold text-muted">Resultado esperado:</span>
                            <p className="text-slate-900">{sug.targetResult}</p>
                          </div>
                        </div>

                        {sug.rationale && (
                          <p className="mt-2 text-[0.6875rem] text-muted italic">
                            Fundamento: {sug.rationale}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
