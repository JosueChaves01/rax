import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listMyProjects } from "@/lib/services/projects";
import { EvaluationView } from "@/shared/ui/evaluation-view";
import { ProjectPicker } from "@/shared/ui/project-picker";

export const metadata = { title: "Evaluación de Etapa · RAX" };

export default async function CycleEvaluationPage({ searchParams }: { searchParams?: Promise<{ proyecto?: string }> }) {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const sp = searchParams ? await searchParams : {};
  const projects = await listMyProjects(d);
  const primaryProject = projects.find((p) => p.id === sp.proyecto) ?? projects[0];

  let relationId = "";
  let goalsCount = 0;
  let achievedGoalsCount = 0;
  let milestonesCount = 0;
  let achievedMilestonesCount = 0;

  if (primaryProject) {
    const [relation] = await d.repo.mentorshipRelations.list({ projectId: primaryProject.id });
    if (relation) {
      relationId = relation.id;
      const goals = await d.repo.mentorshipGoals.list({ relationId: relation.id });
      goalsCount = goals.length;
      achievedGoalsCount = goals.filter((g) => g.status === "achieved").length;
    }

    const milestones = await d.repo.roadmapMilestones.list({ projectId: primaryProject.id });
    milestonesCount = milestones.length;
    achievedMilestonesCount = milestones.filter((m) => m.status === "achieved").length;
  }

  return (
    <div className="space-y-4">
      <ProjectPicker basePath="/app/evaluacion" projects={projects} currentId={primaryProject?.id} />
      <EvaluationView
        key={primaryProject?.id}
        projectId={primaryProject?.id || ""}
        relationId={relationId}
        goalsCount={goalsCount}
        achievedGoalsCount={achievedGoalsCount}
        milestonesCount={milestonesCount}
        achievedMilestonesCount={achievedMilestonesCount}
      />
    </div>
  );
}
