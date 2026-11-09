"use client";

import Link from "next/link";
import { useState } from "react";
import type { IntakeBrief } from "@/types/b2b";
import type { MentorBriefEntry, MentorBriefView } from "@/lib/services/mentor-projects";
import { markIntakeReviewedAction, setClientContextAction } from "@/app/actions/mentor";
import { Button, Card, Empty, Field, Notice, Tag, cx, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { CYCLE_STAGE_LABEL, INTAKE_STATUS_COLOR, INTAKE_STATUS_LABEL, INVITATION_STATUS_LABEL, MODE_LABEL } from "@/app/app/mentor/b2b-labels";

const CONFIDENCE_LABEL = { high: "Alta", medium: "Media", low: "Baja" } as const;
const CONFIDENCE_COLOR = { high: "#059669", medium: "#d97706", low: "#e11d48" } as const;

const keyOf = (b: MentorBriefEntry) => b.clientId ?? "grupo";

export function BriefView({ view }: { view: MentorBriefView }) {
  const { project, briefs, invitations } = view;
  const [tab, setTab] = useState(briefs[0] ? keyOf(briefs[0]) : "");
  const current = briefs.find((b) => keyOf(b) === tab) ?? briefs[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-1.5">
            <Tag color="#4f46e5">{MODE_LABEL[project.mode]}</Tag>
            <Tag color="#0f766e">Etapa: {CYCLE_STAGE_LABEL[project.cycleStage]}</Tag>
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Brief del intake</h2>
          <p className="mt-0.5 text-sm text-slate-500">Lo que contó tu cliente antes de la Sesión 1. Completa lo que falta y márcalo como revisado.</p>
        </div>
        <Link href="/app/mentor" className="text-xs font-semibold text-blue-600 hover:underline">
          ← Clientes
        </Link>
      </div>

      {briefs.length === 0 ? (
        <Empty title="Todavía no hay brief">
          {invitations.some((i) => i.status === "accepted")
            ? "Tu cliente aún no terminó la entrevista. Cuando la envíe, el brief aparece aquí y en tu Bandeja."
            : invitations.length
              ? `Invitación: ${invitations.map((i) => `${i.email} (${INVITATION_STATUS_LABEL[i.status].toLowerCase()})`).join(", ")}. La entrevista empieza cuando la acepten.`
              : "Invita a tu cliente desde Clientes para que responda la entrevista."}
        </Empty>
      ) : (
        <>
          {briefs.length > 1 && (
            <div role="tablist" aria-label="Briefs" className="flex flex-wrap gap-2">
              {briefs.map((b) => {
                const k = keyOf(b);
                return (
                  <button
                    key={k}
                    role="tab"
                    type="button"
                    aria-selected={k === keyOf(current)}
                    onClick={() => setTab(k)}
                    className={cx(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      k === keyOf(current) ? "border-blue-500 bg-blue-50 text-slate-900" : "border-slate-300 text-slate-600 hover:border-slate-400",
                    )}
                  >
                    {b.clientId ? b.clientName : "Consolidado del grupo"}
                    <span className="ml-1.5 text-[11px]" style={{ color: INTAKE_STATUS_COLOR[b.status] }}>
                      · {INTAKE_STATUS_LABEL[b.status]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {current && <BriefPanel key={keyOf(current)} projectId={project.id} entry={current} groupWide={!current.clientId} />}
        </>
      )}

      <ContextCard projectId={project.id} initial={project.clientContext} gaps={briefs.flatMap((b) => b.brief?.gaps ?? [])} />
    </div>
  );
}

function BriefPanel({ projectId, entry, groupWide }: { projectId: string; entry: MentorBriefEntry; groupWide: boolean }) {
  const { run, pending, error } = useAction();
  const b = entry.brief;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">{groupWide ? "Brief del grupo" : entry.clientName}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            <span style={{ color: INTAKE_STATUS_COLOR[entry.status] }}>{INTAKE_STATUS_LABEL[entry.status]}</span>
            {entry.submittedAt && ` · enviado el ${formatDate(entry.submittedAt)}`}
            {entry.reviewedAt && ` · revisado el ${formatDate(entry.reviewedAt)}`}
          </p>
        </div>
        {entry.status === "submitted" && (
          <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => markIntakeReviewedAction(projectId, entry.clientId))}>
            {pending ? "Guardando…" : groupWide ? "Marcar todo revisado" : "Marcar revisado"}
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {b ? (
        <BriefBody brief={b} />
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          {entry.status === "in_progress" ? "La entrevista está en curso; el brief se genera cuando la envíe." : "Todavía no hay brief para esta persona."}
        </p>
      )}
    </Card>
  );
}

function BriefBody({ brief }: { brief: IntakeBrief }) {
  return (
    <div className="mt-5 space-y-6">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Resumen</h4>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">{brief.summary}</p>
      </section>
      {brief.answers.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Respuestas</h4>
          <dl className="mt-2 divide-y divide-slate-100">
            {brief.answers.map((a) => (
              <div key={a.questionId} className="py-2.5">
                <dt className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                  {a.topic}
                  <Tag color={CONFIDENCE_COLOR[a.confidence]}>Confianza {CONFIDENCE_LABEL[a.confidence].toLowerCase()}</Tag>
                </dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-slate-700">{a.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <ListBlock title="Lo que falta" items={brief.gaps} empty="Sin brechas señaladas." />
        <ListBlock title="Riesgos" items={brief.risks} empty="Sin riesgos señalados." />
      </div>
      {brief.suggestedAgenda.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Agenda sugerida para la Sesión 1</h4>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-800">
            {brief.suggestedAgenda.map((t) => (
              <li key={t.id}>
                <span className="font-semibold">{t.title}</span>
                {t.goal && <span className="text-slate-600"> — {t.goal}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className="text-[11px] text-slate-400">Generado el {formatDate(brief.generatedAt)}.</p>
    </div>
  );
}

function ListBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{title}</h4>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
          {items.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function ContextCard({ projectId, initial, gaps }: { projectId: string; initial: string; gaps: string[] }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { run, pending, error } = useAction();
  return (
    <Card className="p-5 sm:p-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          run(() => setClientContextAction(projectId, text), () => setSaved(true));
        }}
      >
        <h3 className="text-base font-bold text-slate-900">Contexto faltante</h3>
        <Field
          id="client-context"
          label="Lo que sabes y la entrevista no cubrió"
          hint="Lo usa el asistente en la Sesión 1 y en el ciclo. Tu cliente no lo ve."
        >
          <textarea id="client-context" rows={6} maxLength={8000} className={inputClass} value={text} onChange={(e) => (setText(e.target.value), setSaved(false))} />
        </Field>
        {gaps.length > 0 && (
          <p className="text-xs text-slate-500">
            Brechas del brief: {[...new Set(gaps)].slice(0, 6).join(" · ")}
          </p>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="success">Contexto guardado.</Notice>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending || text === initial}>
            {pending ? "Guardando…" : "Guardar contexto"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
