import { CHANGE_TEXT, AUDIT_TEXT } from "./timeline-labels";
import { Card, Empty, Tag, formatDate } from "@/shared/ui/primitives";
import { loadWorkspace } from "../data";
import { EvidenceForm } from "./evidence-form";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  const name = (actor: string) => (actor === "ai" ? "IA" : actor === "system" ? "Sistema" : (w.people[actor]?.name ?? "Persona"));
  const itemTitle = (itemId: string) => w.items.find((i) => i.id === itemId)?.title ?? "elemento";

  const timeline = [
    ...w.history.map((h) => ({ at: h.createdAt, who: name(h.actorId), text: `${CHANGE_TEXT[h.change]} «${itemTitle(h.itemId)}»`, reason: h.reason, kind: "item" as const })),
    ...w.audit
      .filter((a) => AUDIT_TEXT[a.action])
      .map((a) => ({ at: a.createdAt, who: name(a.actorId), text: AUDIT_TEXT[a.action]!(a.meta ?? {}), reason: undefined, kind: "audit" as const })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-8">
      <h2 className="display text-4xl">
        Evidencia e <span className="text-highlight">historial.</span>
      </h2>

      <section aria-labelledby="ev-title" className="space-y-4">
        <h3 id="ev-title" className="eyebrow">Evidencia</h3>
        {w.permissions["evidence.add"] && <EvidenceForm projectId={id} />}
        {w.evidence.length === 0 ? (
          <Empty title="Sin evidencia">Registros, capturas, enlaces o notas de lo que observaste. Lo que alguien afirma no es lo mismo que lo verificado.</Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {w.evidence.map((e) => (
              <Card as="li" key={e.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag color="var(--color-ok)">{e.kind === "note" ? "Nota" : e.kind === "link" ? "Enlace" : "Archivo"}</Tag>
                  <span className="ml-auto text-[0.6875rem] text-faint">{name(e.uploadedBy)} · {formatDate(e.createdAt)}</span>
                </div>
                <p className="mt-2 font-semibold">{e.title}</p>
                {e.description && <p className="mt-1 text-sm text-muted">{e.description}</p>}
                {e.url && (
                  <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block truncate text-sm text-cyan underline">
                    {e.url}
                  </a>
                )}
                {e.file && (
                  <p className="mt-1 text-xs text-muted">
                    {e.file.name} · {(e.file.sizeBytes / 1024).toFixed(0)} KB · <span className="text-highlight">archivo no almacenado en el prototipo</span>
                  </p>
                )}
                <p className="mt-2 text-[0.6875rem] text-faint">
                  Respalda: {w.items.filter((i) => i.evidenceIds.includes(e.id)).map((i) => i.title).join(", ") || "sin vincular"}
                  {w.results.some((r) => r.evidenceIds.includes(e.id)) && " · resultado de experimento"}
                </p>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tl-title" className="space-y-3">
        <h3 id="tl-title" className="eyebrow">Historial de cambios</h3>
        {timeline.length === 0 ? (
          <Empty title="Sin cambios todavía" />
        ) : (
          <ol className="relative space-y-3 border-l border-line pl-5">
            {timeline.slice(0, 120).map((t, i) => (
              <li key={i} className="relative text-sm">
                <span aria-hidden className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ${t.kind === "item" ? "bg-cyan" : "bg-accent"}`} />
                <p>
                  <strong>{t.who}</strong> {t.text}
                </p>
                {t.reason && <p className="text-xs text-muted">{t.reason}</p>}
                <p className="font-mono text-[0.625rem] text-faint">{formatDate(t.at)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
