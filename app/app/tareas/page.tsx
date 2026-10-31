import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listMyProjects } from "@/lib/services/projects";
import { TasksView } from "@/shared/ui/tasks-view";
import { ProjectPicker } from "@/shared/ui/project-picker";
import type { Task } from "@/types/domain";

export const metadata = { title: "Tareas y Accountability · RAX" };

export default async function TasksPage({ searchParams }: { searchParams?: Promise<{ proyecto?: string }> }) {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const sp = searchParams ? await searchParams : {};
  const projects = await listMyProjects(d);
  const primaryProject = projects.find((p) => p.id === sp.proyecto) ?? projects[0];

  let tasks: Task[] = [];
  if (primaryProject) {
    tasks = await d.repo.tasks.list({ projectId: primaryProject.id });
  }

  return (
    <div className="space-y-4">
      <ProjectPicker basePath="/app/tareas" projects={projects} currentId={primaryProject?.id} />
      <TasksView
        key={primaryProject?.id}
        initialTasks={tasks}
        projectId={primaryProject?.id || ""}
        projectName={primaryProject?.name || "Proyecto Activo"}
      />
    </div>
  );
}
