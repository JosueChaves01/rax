import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listMyProjects } from "@/lib/services/projects";
import { TasksView } from "@/shared/ui/tasks-view";
import type { Task } from "@/types/domain";

export const metadata = { title: "Tareas y Accountability · RAX" };

export default async function TasksPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const projects = await listMyProjects(d);
  const primaryProject = projects[0];

  let tasks: Task[] = [];
  if (primaryProject) {
    tasks = await d.repo.tasks.list({ projectId: primaryProject.id });
  }

  return (
    <TasksView
      initialTasks={tasks}
      projectId={primaryProject?.id || ""}
      projectName={primaryProject?.name || "Proyecto Activo"}
    />
  );
}
