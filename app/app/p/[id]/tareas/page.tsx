import { loadWorkspace } from "../data";
import { TaskBoard } from "./task-board";

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  return (
    <div className="space-y-6">
      <h2 className="display text-4xl">
        <span className="eyebrow mb-2 block font-sans normal-case">Plan de acción y ejecución</span>
        Hoja de ruta y <span className="text-highlight">ejecución multimodal.</span>
      </h2>
      <p className="max-w-3xl text-sm text-muted">
        Hitos estratégicos y acciones concretas vinculadas a los acuerdos y objetivos de mentoría. No todo problema requiere un experimento: tareas operativas, decisiones estratégicas, revisiones financieras y aprendizajes conviven en un plan accionable con accountability constructivo y no punitivo.
      </p>
      <TaskBoard
        projectId={id}
        tasks={w.tasks}
        milestones={w.roadmapMilestones}
        goals={w.mentorshipGoals}
        experiments={w.experiments.map((e) => ({ id: e.id, question: e.question }))}
        people={w.people as Record<string, { id: string; name: string; role: string }>}
        canManage={w.permissions["task.manage"]}
        canManageRoadmap={w.permissions["roadmap.manage"]}
        canDiagnoseDelay={w.permissions["task.diagnose_delay"]}
      />
    </div>
  );
}
