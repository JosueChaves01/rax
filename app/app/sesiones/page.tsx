import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listMyProjects } from "@/lib/services/projects";
import { SessionsView } from "@/shared/ui/sessions-view";

export const metadata = { title: "Sesiones de mentoría · RAX" };

export default async function SessionsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const projects = await listMyProjects(d);
  const sessions = (
    await Promise.all(projects.map((p) => d.repo.mentorSessions.list({ projectId: p.id })))
  ).flat();

  const relations = (
    await Promise.all(projects.map((p) => d.repo.mentorshipRelations.list({ projectId: p.id })))
  ).flat();

  const goals = (
    await Promise.all(relations.map((r) => d.repo.mentorshipGoals.list({ relationId: r.id })))
  ).flat();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/app/calendario" className="text-xs font-semibold text-blue-600 hover:underline">
          Ver en calendario →
        </Link>
      </div>
      <SessionsView initialSessions={sessions} projects={projects} goals={goals} viewerId={d.actor.id} />
    </div>
  );
}
