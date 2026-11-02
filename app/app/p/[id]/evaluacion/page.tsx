import { loadWorkspace } from "../data";
import { CycleTrack } from "../cycle-track";
import { CycleEvaluationView } from "./cycle-evaluation-view";

export const metadata = { title: "Cierre del ciclo · RAX" };

export default async function CycleEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);

  return (
    <div className="space-y-6">
      <CycleTrack w={w} active="evaluacion" />
      <CycleEvaluationView projectId={id} workspace={w} />
    </div>
  );
}
