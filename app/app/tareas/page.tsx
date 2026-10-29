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
    if (tasks.length === 0) {
      // Seed inicial de compromisos reales para el proyecto
      const now = d.now();
      const inTwoDays = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const completedYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const initial: Task[] = [
        {
          id: d.newId("task"),
          projectId: primaryProject.id,
          title: "Completar ejercicio PREP de objeciones comerciales",
          status: "doing",
          assigneeId: d.actor.id,
          dueDate: inTwoDays,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: d.newId("task"),
          projectId: primaryProject.id,
          title: "Validar propuesta de valor con primeros clientes",
          status: "todo",
          assigneeId: d.actor.id,
          dueDate: inFiveDays,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: d.newId("task"),
          projectId: primaryProject.id,
          title: "Revisar plan de acción quincenal con mentor",
          status: "todo",
          assigneeId: d.actor.id,
          dueDate: inTwoDays,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: d.newId("task"),
          projectId: primaryProject.id,
          title: "Enviar propuesta comercial ajustada",
          status: "done",
          assigneeId: d.actor.id,
          dueDate: completedYesterday,
          createdAt: now,
          updatedAt: now,
        },
      ];
      for (const t of initial) {
        await d.repo.tasks.insert(t);
      }
      tasks = initial;
    }
  }

  return (
    <TasksView
      initialTasks={tasks}
      projectId={primaryProject?.id || ""}
      projectName={primaryProject?.name || "Proyecto Activo"}
    />
  );
}
