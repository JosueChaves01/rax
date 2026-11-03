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
import { CloseStep } from "@/app/app/p/[id]/mentoria/sessions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sala de mentoría · RAX" };

/**
 * Pantalla de la llamada, a pantalla completa y sin scroll: la videollamada ocupa el centro, el
 * contexto del proyecto se abre en ventanas y los controles viven en la barra inferior.
 */
export default async function CallRoomPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ modo?: string }> }) {
  const [{ sessionId }, { modo }] = await Promise.all([params, searchParams]);
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const raw = await d.repo.mentorSessions.get(sessionId);
  if (!raw) notFound();
  // loadWorkspace valida que quien mira pueda ver el proyecto (si no, 404).
  const { w, actor } = await loadWorkspace(raw.projectId);
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

  const problems = w.items.filter((i) => i.category === "problem" && i.reviewStatus !== "rejected" && i.infoType !== "unknown");
  const close = (
    <CloseStep
      projectId={w.project.id}
      session={session}
      people={w.people as Record<string, { id: string; name: string; role: string }>}
      isSessionMentor={session.mentorId === actor.id}
      isOwner={w.project.ownerId === actor.id}
      items={w.items.filter((i) => i.reviewStatus !== "rejected").map((i) => ({ id: i.id, title: i.title }))}
      problems={problems.map((i) => ({ id: i.id, title: i.title, priority: i.priority && { rank: i.priority.rank, rationale: i.priority.rationale } }))}
      hypotheses={w.hypotheses}
      experiments={w.experiments}
      results={w.results}
      goals={w.mentorshipGoals}
      roadmapMilestones={w.roadmapMilestones}
    />
  );

  return (
    <CallRoom
      projectId={w.project.id}
      sessionTitle={`${SESSION_KIND_LABEL[session.kind]} · ${w.project.name}`}
      isMentor={w.isMentorView}
      initialMode={modo === "cierre" ? "cierre" : "reunion"}
      closed={session.status === "completed"}
      close={close}
      sessionId={sessionId}
      title={`${SESSION_KIND_LABEL[session.kind]} · ${w.project.name}`}
      subtitle={subtitle}
      backHref={sessionHref(session)}
      sections={buildContextSections({ w, session, documents, replies })}
    />
  );
}
