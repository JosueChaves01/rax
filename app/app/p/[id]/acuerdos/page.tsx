import { loadWorkspace } from "../data";
import { CycleTrack } from "../cycle-track";
import { AgreementsUI } from "./agreements-ui";

export default async function AgreementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w, actor } = await loadWorkspace(id);

  return (
    <div className="space-y-6">
      <CycleTrack w={w} active="orientar" />
      <AgreementsUI projectId={id} workspace={w} actor={actor} />
    </div>
  );
}
