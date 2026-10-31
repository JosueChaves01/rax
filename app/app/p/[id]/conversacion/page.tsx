import { notFound } from "next/navigation";
import { Empty } from "@/shared/ui/primitives";
import { stageOf } from "@/features/projects/stages";
import { loadWorkspace } from "../data";
import { ProjectConversationClient } from "./project-conversation-client";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  if (!w) notFound();

  // Cada persona conversa con el agente en sus propios hilos: el mentor también lleva sus pasos desde aquí.
  const canWrite = Boolean(w.permissions["agent.chat"]);
  if (!canWrite) {
    return <Empty title="Conversación no disponible">Tu rol no conversa con el agente dentro de este proyecto.</Empty>;
  }
  const currentStage = stageOf(w.phase);
  const mentorNames = w.mentors.map((m) => w.people[m]?.name).filter(Boolean);

  return (
    <ProjectConversationClient
      projectId={id}
      projectName={w.project.name}
      stage={currentStage.id}
      phase={w.phase}
      stageId={currentStage.id}
      stageLabel={currentStage.label}
      stageQuestion={currentStage.question}
      diagnosisSummary={w.diagnosis?.summary}
      summaryConfirmed={Boolean(w.diagnosis?.summaryConfirmedAt)}
      diagnosisItemCount={w.items.length}
      hasMentor={w.mentors.length > 0}
      mentorNames={mentorNames}
      canWrite={canWrite}
      isMentorView={w.isMentorView}
    />
  );
}
