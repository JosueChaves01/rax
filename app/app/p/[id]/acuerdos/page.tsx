import { loadWorkspace } from "../data";
import { BackToCycle } from "../cycle-track";
import { AgreementsUI } from "./agreements-ui";

export default async function AgreementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w, actor } = await loadWorkspace(id);

  return (
    <div className="space-y-6">
      <BackToCycle w={w} to="orientar" />
      <AgreementsUI projectId={id} workspace={w} actor={actor} />
    </div>
  );
}
