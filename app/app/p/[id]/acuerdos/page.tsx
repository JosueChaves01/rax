import { loadWorkspace } from "../data";
import { AgreementsUI } from "./agreements-ui";

export default async function AgreementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w, actor } = await loadWorkspace(id);

  return (
    <AgreementsUI
      projectId={id}
      workspace={w}
      actor={actor}
    />
  );
}

