import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listResources } from "@/lib/services/resources";
import { ResourcesView } from "./resources-view";

export const metadata = { title: "Biblioteca de Recursos · RAX" };

export default async function MentorResourcesPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const resources = await listResources(d);
  const isMentor = d.actor.role === "mentor" || d.actor.role === "admin";

  return <ResourcesView initialResources={resources} isMentor={isMentor} />;
}

