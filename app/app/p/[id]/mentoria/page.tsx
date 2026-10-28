import { Empty, Notice } from "@/shared/ui/primitives";
import { loadWorkspace } from "../data";
import { ReviewRequests, SessionCard, SharingToggle } from "./sessions";

export default async function MentoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w, actor } = await loadWorkspace(id);
  const mentorNames = w.mentors.map((m) => w.people[m]?.name).filter(Boolean);
  const sessions = [...w.sessions].reverse();

  return (
    <div className="space-y-6">
      <h2 className="display text-4xl">
        Mentoría <span className="text-highlight">desde el inicio.</span>
      </h2>

      {!w.isMentorView && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-panel p-5">
            <p className="eyebrow">Mentor asignado</p>
            {mentorNames.length ? (
              <p className="display mt-2 text-2xl">{mentorNames.join(", ")}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Todavía no tenés mentor. Podés seguir conversando y ordenando información; las decisiones que requieren revisión humana quedan
                pendientes hasta que la administración asigne a alguien.
              </p>
            )}
            {w.permissions["project.update"] && <SharingToggle projectId={id} shared={w.project.shareConversationWithMentor} />}
          </div>
          {w.permissions["mentor.request_review"] && <ReviewRequests projectId={id} sessions={w.sessions} summaryConfirmed={!!w.diagnosis.summaryConfirmedAt} hasResults={w.results.length > 0} />}
        </div>
      )}

      {w.isMentorView && (
        <Notice>
          Ves este proyecto porque tenés una asignación activa. Tus notas y decisiones quedan registradas con tu nombre. Lo que la IA organizó
          puede no ser definitivo: revisá el origen de cada elemento en el diagnóstico.
        </Notice>
      )}

      {sessions.length === 0 ? (
        <Empty title="Sin revisiones todavía">
          La primera revisión se pide cuando el emprendedor confirma su resumen inicial. Así el mentor orienta el enfoque antes de que se arme un
          plan rígido.
        </Empty>
      ) : (
        <ul className="space-y-4">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              projectId={id}
              session={s}
              notes={w.notes.filter((n) => n.sessionId === s.id)}
              people={w.people as Record<string, { id: string; name: string; role: string }>}
              isSessionMentor={s.mentorId === actor.id}
              items={w.items.filter((i) => i.reviewStatus !== "rejected").map((i) => ({ id: i.id, title: i.title }))}
              hypotheses={w.hypotheses}
              experiments={w.experiments}
              results={w.results}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
