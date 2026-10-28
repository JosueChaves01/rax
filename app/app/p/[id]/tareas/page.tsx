import { loadWorkspace } from "../data";
import { TaskBoard } from "./task-board";

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  return (
    <div className="space-y-6">
      <h2 className="display text-4xl">
        Tareas y <span className="text-highlight">seguimiento.</span>
      </h2>
      <TaskBoard
        projectId={id}
        tasks={w.tasks}
        experiments={w.experiments.map((e) => ({ id: e.id, question: e.question }))}
        people={w.people as Record<string, { id: string; name: string; role: string }>}
        canManage={w.permissions["task.manage"]}
      />
    </div>
  );
}
