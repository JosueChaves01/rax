import { MentoringView } from "../mentoria/view";

export default async function DecidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MentoringView id={id} kind="second_review" />;
}
