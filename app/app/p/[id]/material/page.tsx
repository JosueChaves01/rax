import { notFound } from "next/navigation";
import { isB2BFlow } from "@/lib/flags";
import { listPublishedResources } from "@/lib/services/client-portal";
import type { DocKind, PublishedResource } from "@/types/b2b";
import { Card, Empty, Tag, formatDate } from "@/shared/ui/primitives";
import { ViewDocumentButton } from "@/shared/ui/document-viewer";
import { loadWorkspace } from "../data";
import { loadCycleOverview, sessionTitle } from "../cycle-data";
import { loadB2B } from "../evaluaciones/data";
import { CommentsThread } from "./comments-thread";

export const metadata = { title: "Material · RAX" };

const KIND_LABEL: Record<DocKind, string> = {
  material: "Material",
  summary: "Resumen de sesión",
  transcript: "Transcripción",
  agreement: "Acuerdo",
  intake: "Entrevista",
};

/**
 * Material publicado de un proyecto B2B, agrupado por sesión. La persona cliente ve lo que su mentor
 * publicó para todo el grupo o para ella; el mentor ve todo lo publicado. Cada material se abre en el
 * visor y tiene su hilo de comentarios; cada sesión también.
 */
export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isB2BFlow()) notFound();
  const { w } = await loadWorkspace(id);
  if (!w.project.mentorId) notFound();
  const [resources, o] = await Promise.all([loadB2B((d) => listPublishedResources(d, id)), loadCycleOverview(id)]);
  const isMentor = o.viewer === "mentor";
  const clientName = new Map(o.clients.map((c) => [c.id, c.name]));

  // Grupos por sesión (de la más reciente a la más vieja) y al final lo que no es de una sesión.
  const bySession = new Map<string, PublishedResource[]>();
  const loose: PublishedResource[] = [];
  for (const r of resources) {
    if (r.sessionId && o.sessions.some((s) => s.id === r.sessionId)) bySession.set(r.sessionId, [...(bySession.get(r.sessionId) ?? []), r]);
    else loose.push(r);
  }
  const groups = [...o.sessions]
    .reverse()
    .filter((s) => bySession.has(s.id) || s.status === "completed")
    .map((s) => ({ key: s.id, title: sessionTitle(s), when: s.completedAt ?? s.scheduledAt, sessionId: s.id as string | undefined, items: bySession.get(s.id) ?? [] }));
  if (loose.length) groups.push({ key: "general", title: "Material general", when: undefined, sessionId: undefined, items: loose });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Material</h2>
        <p className="text-sm text-slate-600">
          {isMentor
            ? "Lo que publicaste para tu cliente, por sesión. Publica documentos desde la sala o desde Documentos."
            : "Lo que tu mentor publicó para ti, por sesión. Ábrelo, coméntalo y pregúntale tus dudas."}
        </p>
      </div>

      {resources.length === 0 && groups.length === 0 ? (
        <Empty title="Todavía no hay material publicado">
          {isMentor ? "Cuando publiques un resumen o una guía, aparecerá aquí y le avisaremos a tu cliente." : "Cuando tu mentor publique algo, te avisaremos y lo verás aquí."}
        </Empty>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`g-${g.key}`} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`g-${g.key}`} className="text-lg font-bold text-slate-900">
                {g.title}
              </h3>
              {g.when && <span className="text-xs text-slate-500">{formatDate(g.when)}</span>}
            </div>
            {g.items.length === 0 ? (
              <p className="text-sm text-slate-500">Sin material publicado de esta sesión.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {g.items.map((r) => (
                  <Card as="li" key={r.documentId} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <Tag color="#0284c7">{KIND_LABEL[r.docKind] ?? "Material"}</Tag>
                          {isMentor && r.audienceClientId && <span className="text-xs text-slate-500">Solo para {clientName.get(r.audienceClientId) ?? "una persona"}</span>}
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">{r.title}</p>
                        <p className="text-xs text-slate-500">Publicado el {formatDate(r.publishedAt)}</p>
                      </div>
                      <ViewDocumentButton
                        docRef={{ proyecto: id, documento: r.documentId }}
                        title={r.title}
                        className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Ver
                      </ViewDocumentButton>
                    </div>
                    <CommentsThread projectId={id} target={{ type: "document", id: r.documentId }} count={r.commentCount} />
                  </Card>
                ))}
              </ul>
            )}
            {g.sessionId && <CommentsThread projectId={id} target={{ type: "session", id: g.sessionId }} label="Comentarios de la sesión" />}
          </section>
        ))
      )}
    </div>
  );
}
