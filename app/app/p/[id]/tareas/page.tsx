import { loadWorkspace } from "../data";
import { TaskBoard } from "./task-board";

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  return (
    <div className="space-y-6">
      <h2 className="display text-4xl">
        <span className="eyebrow mb-2 block font-sans normal-case">Archivo</span>
        Todas las <span className="text-highlight">tareas.</span>
      </h2>
      <p className="max-w-3xl text-sm text-muted">Vista de consulta. Las tareas de cada experimento también se manejan desde su tarjeta, en Probar.</p>
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
