"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionPublishablesAction, publishSessionSynthesisAction } from "@/app/actions/mentor";
import { PublishControls, audienceLabel, type PublishAudience } from "@/app/app/p/[id]/documentos/publish-controls";
import { Tag } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import type { SessionPublishables } from "@/lib/services/publishing";
import type { DocKind } from "@/types/b2b";

const KIND_LABEL: Record<DocKind, string> = {
  material: "Material",
  summary: "Síntesis",
  transcript: "Transcripción",
  agreement: "Acuerdo",
  intake: "Intake",
};

/**
 * «Publicar al cliente» en la sala del mentor (B2B): la síntesis de la sesión con un clic (como
 * documento `summary`), las transcripciones de las llamadas y el material ligado a la sesión.
 * Nada se publica solo: cada cosa la confirma el mentor.
 */
export function PublishPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<SessionPublishables | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getSessionPublishablesAction(sessionId);
    if (res.ok && res.data) {
      setData(res.data);
      setLoadError(null);
    } else if (!res.ok) setLoadError(res.error);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) return <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">{loadError}</p>;
  if (!data) return <p className="text-xs text-slate-500">Cargando…</p>;
  const audience: PublishAudience = { mode: data.mode, clients: data.clients };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs leading-relaxed text-slate-600">
        Lo que publiques aparece en «Material» de tu cliente{data.mode === "group" ? " (para todo el grupo o para una persona)" : ""} y le llega un aviso. Las notas en vivo y el brief nunca se publican.
      </p>

      <section aria-label="Síntesis de la sesión" className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Síntesis</p>
        {data.synthesis ? (
          <SynthesisPublish sessionId={sessionId} synthesis={data.synthesis} audience={audience} onDone={load} />
        ) : (
          <p className="mt-1 text-xs text-slate-500">Todavía no hay síntesis. Se genera en el cierre de la sesión; cuando la revises, la publicas desde acá con un clic.</p>
        )}
      </section>

      <section aria-label="Transcripciones y material" className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Transcripciones y material de la sesión</p>
        {data.documents.length ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.documents.map((doc) => (
              <li key={doc.id} className="py-2">
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Tag>{KIND_LABEL[doc.docKind]}</Tag>
                  <span className="min-w-0 truncate">{doc.title}</span>
                </p>
                <PublishControls
                  documentId={doc.id}
                  state={{ visibility: doc.visibility, audienceClientId: doc.audienceClientId }}
                  audience={audience}
                  sessionId={sessionId}
                  docKind={doc.docKind}
                  compact
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Aquí aparecen la transcripción de la llamada y el material que generes con el asistente durante la sesión.</p>
        )}
      </section>
    </div>
  );
}

function SynthesisPublish({
  sessionId,
  synthesis,
  audience,
  onDone,
}: {
  sessionId: string;
  synthesis: NonNullable<SessionPublishables["synthesis"]>;
  audience: PublishAudience;
  onDone: () => void;
}) {
  const { run, pending, error } = useAction();
  const doc = synthesis.document;
  const published = doc?.visibility === "published";
  const [target, setTarget] = useState(doc?.audienceClientId ?? "");
  const group = audience.mode === "group" && audience.clients.length > 1;
  // Si la síntesis se editó después de publicarla, se ofrece publicar la versión vigente.
  const outdated = published && !!synthesis.editedAt && !!doc?.publishedAt && synthesis.editedAt > doc.publishedAt;

  return (
    <div className="mt-1 space-y-2">
      <p className="line-clamp-4 whitespace-pre-wrap text-xs text-slate-700">{synthesis.summary}</p>
      {published && doc ? (
        <>
          <PublishControls documentId={doc.id} state={{ visibility: doc.visibility, audienceClientId: doc.audienceClientId }} audience={audience} docKind="summary" sessionId={sessionId} onChange={onDone} compact />
          {outdated && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => publishSessionSynthesisAction(sessionId, doc.audienceClientId), onDone)}
              className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
            >
              {pending ? "Actualizando…" : "Editaste la síntesis: publicar la versión actual"}
            </button>
          )}
        </>
      ) : audience.clients.length === 0 ? (
        <p className="text-xs text-slate-500">Cuando alguien acepte la invitación podrás publicársela.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {group && (
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Para quién" className="h-8 rounded-full border border-slate-300 bg-white px-2 text-xs text-slate-800">
              <option value="">Todo el grupo</option>
              {audience.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => publishSessionSynthesisAction(sessionId, group && target ? target : undefined), onDone)}
            className="h-8 cursor-pointer rounded-full bg-blue-600 px-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Publicando…" : `Publicar síntesis · ${audienceLabel(audience, group && target ? target : undefined).toLowerCase()}`}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
