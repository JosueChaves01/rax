import { loadWorkspace } from "../data";
import { BackToCycle } from "../cycle-track";
import { CycleEvaluationView } from "./cycle-evaluation-view";

export const metadata = { title: "Cierre del ciclo · RAX" };

export default async function CycleEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);

  return (
    <div className="space-y-6">
      <BackToCycle w={w} to="decidir" />
      <CycleEvaluationView projectId={id} workspace={w} />
    </div>
  );
}
