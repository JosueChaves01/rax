import { DIAGNOSIS_STATUS_LABEL } from "@/features/labels";
import { Tag } from "@/shared/ui/primitives";
import { loadWorkspace } from "../data";
import { DiagnosisBoard, SummaryPanel } from "./board";

export default async function DiagnosisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="display text-4xl">
          <span className="eyebrow mb-2 block font-sans normal-case">Etapa 1 · Entender</span>
          Diagnóstico <span className="text-highlight">vivo.</span>
        </h2>
        <Tag color="var(--color-cyan)">{DIAGNOSIS_STATUS_LABEL[w.diagnosis.status]}</Tag>
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
