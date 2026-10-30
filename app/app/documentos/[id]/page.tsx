import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { DocumentEditorView } from "@/shared/ui/document-editor-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Editor de Documentos · RAX" };

export default async function DocumentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const { id } = await params;
  const doc = await d.repo.mentorResources.get(id);

  return <DocumentEditorView docId={id} initialDoc={doc} />;
}
