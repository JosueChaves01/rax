import { loadWorkspace } from "../data";
import { CycleEvaluationView } from "./cycle-evaluation-view";

export const metadata = { title: "Evaluación de Ciclo · RAX" };

export default async function CycleEvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);

  return <CycleEvaluationView projectId={id} workspace={w} />;
}
