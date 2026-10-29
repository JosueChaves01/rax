import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listResources } from "@/lib/services/resources";
import { DocumentsView } from "@/shared/ui/documents-view";

export const metadata = { title: "Centro de Documentos · RAX" };

export default async function DocumentsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const resources = await listResources(d);

  return <DocumentsView initialResources={resources} />;
}
