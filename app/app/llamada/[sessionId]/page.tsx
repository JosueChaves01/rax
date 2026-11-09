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
import { isB2BFlow } from "@/lib/flags";
import { getSessionRoomState, type SessionRoomState } from "@/lib/services/session-room";
import { AgreementPanel, ConfirmedAgreementView, LiveNotesPanel } from "./b2b-panels";
import type { RoomSection } from "./room";
import { PublishPanel } from "./publish-panel";

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

  // Flujo B2B: la sala sabe si mira el mentor de la sesión o un cliente del proyecto. Va primero porque
  // el cliente no lee mentor_sessions por RLS (20261109000104): la sala verifica y le da lo seguro.
  const room: SessionRoomState | null = isB2BFlow() ? await getSessionRoomState(d, sessionId).catch(() => null) : null;
  if (room?.viewer === "client") {
    return <ClientRoom room={room} backHref={`/app/p/${room.session.projectId}`} initialClosed={room.session.status === "completed"} />;
  }

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
      sections={room ? mentorB2BSections(room, buildContextSections({ w, session, documents, replies, b2b: { briefs: room.briefs ?? [], clientContext: room.clientContext ?? "", agenda: room.session.agenda } })) : buildContextSections({ w, session, documents, replies })}
      b2b={room ? { viewer: "mentor", publish: { mode: room.project.mode, clients: room.clients } } : undefined}
    />
  );
}

/** Mentor en B2B: «Notas en vivo» después de la agenda, en la Sesión 1 el panel del acuerdo, y «Publicar al cliente». */
function mentorB2BSections(room: SessionRoomState, base: RoomSection[]): RoomSection[] {
  const closed = room.session.status === "completed";
  const extra: RoomSection[] = [
    {
      id: "vivo",
      title: "Notas en vivo",
      short: "Notas en vivo",
      node: <LiveNotesPanel sessionId={room.session.id} initialText={room.liveNotes?.text ?? ""} initialUpdatedAt={room.liveNotes?.updatedAt} closed={closed} />,
    },
  ];
  if (room.session.kind === "kickoff") {
    extra.push({
      id: "acuerdo",
      title: room.project.mode === "group" ? "Acuerdo del grupo" : "Acuerdo de la Sesión 1",
      short: "Acuerdo",
      node: (
        <AgreementPanel
          sessionId={room.session.id}
          mode={room.project.mode}
          clients={room.clients}
          agreement={room.agreement}
          goals={room.goals}
          commitments={room.commitments}
          closed={closed}
        />
      ),
    });
  }
  // Fase 4: publicar al cliente la síntesis (un clic), las transcripciones y el material de la sesión.
  extra.push({ id: "publicar", title: "Publicar al cliente", short: "Publicar", node: <PublishPanel sessionId={room.session.id} /> });
  const at = base.findIndex((s) => s.id === "sesion") + 1;
  return [...base.slice(0, at), ...extra, ...base.slice(at)];
}

/** Cliente en B2B: solo la llamada y el acuerdo confirmado (sin notas en vivo, brief ni asistente). */
function ClientRoom({ room, backHref, initialClosed }: { room: SessionRoomState; backHref: string; initialClosed: boolean }) {
  const when = room.session.scheduledAt;
  const title = `${room.session.kind === "kickoff" ? "Sesión 1" : room.session.sessionNumber ? `Sesión ${room.session.sessionNumber}` : SESSION_KIND_LABEL[room.session.kind]} · ${room.project.name}`;
  return (
    <CallRoom
      projectId={room.project.id}
      sessionTitle={title}
      isMentor={false}
      initialMode="reunion"
      closed={false}
      close={null}
      sessionId={room.session.id}
      title={title}
      subtitle={`Con ${room.mentorName}${when ? ` · ${formatDate(when)}` : ""} · ${initialClosed ? "Sesión cerrada" : room.session.status === "in_progress" ? "En curso" : "Pendiente"}`}
      backHref={backHref}
      sections={[
        {
          id: "acuerdo",
          title: "Acuerdo",
          short: "Acuerdo",
          node: <ConfirmedAgreementView agreement={room.agreement} goals={room.goals} commitments={room.commitments} mode={room.project.mode} />,
        },
      ]}
      b2b={{ viewer: "client" }}
    />
  );
}
