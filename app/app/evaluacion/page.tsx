import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listMyProjects } from "@/lib/services/projects";

/** La evaluación del ciclo vive dentro de cada proyecto (docs/alcance.md). */
export default async function CycleEvaluationRedirect({ searchParams }: { searchParams?: Promise<{ proyecto?: string }> }) {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  const sp = searchParams ? await searchParams : {};
  const projects = await listMyProjects(d);
  const target = projects.find((p) => p.id === sp.proyecto) ?? projects[0];
  redirect(target ? `/app/p/${target.id}/evaluacion` : "/app");
}
