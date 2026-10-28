import { MentoringView } from "../mentoria/view";

export default async function OrientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MentoringView id={id} kind="first_review" />;
}
