import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listProjectDocuments } from "@/lib/services/project-knowledge";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { formatDate } from "@/shared/ui/primitives";
import { sessionHref } from "@/shared/ui/sessions-view";
import { loadWorkspace } from "@/app/app/p/[id]/data";
import type { ProjectKnowledgeDocument, SessionNoteReply } from "@/types/domain";
import { ContextPanel } from "./context-panel";
import { CallRoom } from "./room";

export const dynamic = "force-dynamic";
export const metadata = { title: "Llamada de mentoría · RAX" };

/**
 * Pantalla de la llamada: la videollamada con transcripción a un lado y, al otro, todo el contexto
 * vigente del proyecto para que mentor y emprendedor se orienten mientras conversan.
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

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={sessionHref(session)} className="text-xs font-semibold text-blue-600 hover:underline">
            ← Volver a la sesión
          </Link>
          <h1 className="display mt-2 text-2xl leading-tight text-slate-900 sm:text-3xl">
            {SESSION_KIND_LABEL[session.kind]} · {w.project.name}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Con {mentorName} · {session.scheduledAt ? "📅 " : ""}
            {formatDate(when)} · {session.status === "completed" ? "Sesión cerrada" : session.status === "in_progress" ? "En curso" : "Pendiente"}
          </p>
        </div>
      </header>

      <CallRoom sessionId={sessionId} context={<ContextPanel w={w} session={session} documents={documents} replies={replies} />} />
    </div>
  );
}
