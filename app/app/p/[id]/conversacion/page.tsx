import { notFound } from "next/navigation";
import { Empty } from "@/shared/ui/primitives";
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

  return (
    <ProjectConversationClient
      projectId={id}
      projectName={w.project.name}
      stage={w.phase}
      canWrite={canWrite}
      isMentorView={w.isMentorView}
    />
  );
}
