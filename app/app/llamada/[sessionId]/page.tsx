import { notFound, redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listProjectDocuments } from "@/lib/services/project-knowledge";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { formatDate } from "@/shared/ui/primitives";
import { sessionHref } from "@/shared/ui/sessions-view";
import { loadWorkspace } from "@/app/app/p/[id]/data";
import type { ProjectKnowledgeDocument, SessionNoteReply } from "@/types/domain";
import { buildContextSections } from "./context-panel";
import { CallRoom } from "./room";

export const dynamic = "force-dynamic";
export const metadata = { title: "Llamada de mentoría · RAX" };

/**
 * Pantalla de la llamada, a pantalla completa y sin scroll: la videollamada ocupa el centro, el
 * contexto del proyecto se abre en ventanas y los controles viven en la barra inferior.
 */
export default async function CallRoomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const raw = await d.repo.mentorSessions.get(sessionId);
  if (!raw) notFound();
  // loadWorkspace valida que quien mira pueda ver el proyecto (si no, 404).
  const { w } = await loadWorkspace(raw.projectId);
  const session = w.sessions.find((s) => s.id === sessionId);
  if (!session) notFound();

  const [documents, replies] = await Promise.all([
    listProjectDocuments(d, w.project.id).catch((): ProjectKnowledgeDocument[] => []),
    // Sin la migración de respuestas a notas, simplemente no se muestran.
    d.repo.sessionNoteReplies.list({ sessionId }).catch((): SessionNoteReply[] => []),
  ]);

  const mentorName = w.people[session.mentorId]?.name ?? "Mentor";
  const when = session.scheduledAt ?? session.startedAt ?? session.createdAt;
  const subtitle = `Con ${mentorName} · ${formatDate(when)} · ${
    session.status === "completed" ? "Sesión cerrada" : session.status === "in_progress" ? "En curso" : "Pendiente"
  }`;

  return (
    <CallRoom
      sessionId={sessionId}
      title={`${SESSION_KIND_LABEL[session.kind]} · ${w.project.name}`}
      subtitle={subtitle}
      backHref={sessionHref(session)}
      sections={buildContextSections({ w, session, documents, replies })}
    />
  );
}
