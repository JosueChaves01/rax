import { notFound } from "next/navigation";
import { Empty } from "@/shared/ui/primitives";
import { stageOf } from "@/features/projects/stages";
import { loadWorkspace } from "../data";
import { ProjectConversationClient } from "./project-conversation-client";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  if (!w) notFound();

  if (w.conversationHidden) {
    return (
      <Empty title="Conversación privada">
        El emprendedor no compartió la conversación completa. Trabajá con el resumen preparado y el diagnóstico, que contienen lo que confirmó.
      </Empty>
    );
  }

  const canWrite = Boolean(w.permissions["conversation.write"]);
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
