import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listResources } from "@/lib/services/resources";
import { listLibraryDocuments } from "@/lib/services/project-knowledge";
import { DocumentsView } from "@/shared/ui/documents-view";

export const metadata = { title: "Documentos · RAX" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ recurso?: string }> }) {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  const { recurso } = await searchParams;

  const [documents, resources] = await Promise.all([listLibraryDocuments(d), listResources(d)]);

  return <DocumentsView documents={documents} resources={resources} initialTab={recurso ? "biblioteca" : undefined} initialResourceId={recurso} />;
}
