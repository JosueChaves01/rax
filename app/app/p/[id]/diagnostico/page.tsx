import Link from "next/link";
import { DIAGNOSIS_STATUS_LABEL } from "@/features/labels";
import type { DiagnosisStatus } from "@/types/domain";
import { loadWorkspace } from "../data";
import { DiagnosisBoard, SummaryPanel } from "./board";

const STATUS_CONFIG: Record<DiagnosisStatus, { label: string; bg: string }> = {
  exploring: { label: "En exploración", bg: "bg-blue-50 text-blue-700 border-blue-200" },
  pending_review: { label: "Pendiente de revisión", bg: "bg-amber-50 text-amber-700 border-amber-200" },
  reviewed: { label: "Revisado", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ready_for_prioritization: { label: "Listo para priorizar", bg: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  ready_for_experiments: { label: "Listo para experimentos", bg: "bg-purple-50 text-purple-700 border-purple-200" },
};

export default async function DiagnosisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);

  const statusConfig = STATUS_CONFIG[w.diagnosis.status] || {
    label: DIAGNOSIS_STATUS_LABEL[w.diagnosis.status] || w.diagnosis.status,
    bg: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <p className="eyebrow">Etapa 1 · Entender</p>
        <h2 className="display mt-2 text-4xl">
          Diagnóstico <span className="text-highlight">vivo.</span>
        </h2>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          Se construye y refina a partir de la conversación con el Asistente de IA. Reúne afirmaciones, hechos, incógnitas y problemas para transferirlos como contexto a la <strong>Etapa 2 · Orientar</strong>.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border shadow-2xs ${statusConfig.bg}`}>
            ● {statusConfig.label}
          </span>
          <Link
            href={`/app/p/${id}/conversacion`}
            className="inline-block text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:text-accent-strong"
          >
            💬 Ir a la conversación →
          </Link>
        </div>
      </div>

      <SummaryPanel
        projectId={id}
        summary={w.diagnosis.summary}
        confirmedAt={w.diagnosis.summaryConfirmedAt}
        confirmedBy={w.diagnosis.summaryConfirmedBy ? w.people[w.diagnosis.summaryConfirmedBy]?.name : undefined}
        canConfirm={w.permissions["diagnosis.confirm_summary"]}
      />

      <DiagnosisBoard
        projectId={id}
        items={w.items}
        history={w.history}
        comments={w.comments}
        evidence={w.evidence}
        people={w.people as Record<string, { id: string; name: string; role: string }>}
        perms={w.permissions}
      />
    </div>
  );
}
