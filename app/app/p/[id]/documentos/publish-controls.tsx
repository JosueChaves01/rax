"use client";

import { useState } from "react";
import { publishDocumentAction, unpublishDocumentAction } from "@/app/actions/mentor";
import { Tag, cx } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import type { DocKind, DocumentVisibility, ProjectMode } from "@/types/b2b";

/** Quién recibe lo publicado (solo lo usa el mentor, con RAX_B2B_FLOW). */
export interface PublishAudience {
  mode: ProjectMode;
  clients: Array<{ id: string; name: string }>;
}

export interface PublicationState {
  visibility: DocumentVisibility;
  audienceClientId?: string;
}

const ALL = "";

/** «Para todo el grupo», «Para Cami» o «Para el cliente». */
export function audienceLabel(audience: PublishAudience, clientId?: string): string {
  if (clientId) return `Para ${audience.clients.find((c) => c.id === clientId)?.name ?? "una persona"}`;
  return audience.mode === "group" ? "Para todo el grupo" : "Para el cliente";
}

/**
 * «Publicar al cliente» de un documento del proyecto, con selector de destinatario en proyectos
 * grupales (todo el grupo o una persona). Si ya está publicado muestra para quién y permite
 * despublicarlo. Publicar siempre lo confirma el mentor con este botón.
 */
export function PublishControls({
  documentId,
  state,
  audience,
  sessionId,
  docKind,
  compact,
  onChange,
  defaultAudienceClientId,
}: {
  documentId: string;
  state?: PublicationState;
  audience: PublishAudience;
  sessionId?: string;
  docKind?: DocKind;
  /** Versión corta, para tarjetas del chat. */
  compact?: boolean;
  onChange?: (next: PublicationState) => void;
  /** Destinatario sugerido (p. ej. el que propuso el asistente) mientras no esté publicado. */
  defaultAudienceClientId?: string;
}) {
  const { run, pending, error } = useAction();
  const [local, setLocal] = useState<PublicationState | undefined>(state);
  const current = local ?? state;
  const published = current?.visibility === "published";
  const [target, setTarget] = useState<string>(current?.audienceClientId ?? defaultAudienceClientId ?? ALL);
  const group = audience.mode === "group" && audience.clients.length > 1;

  const publish = () =>
    run(
      () => publishDocumentAction(documentId, { sessionId, docKind, audienceClientId: group && target ? target : undefined }),
      (r) => {
        const next: PublicationState = { visibility: "published", audienceClientId: r.ok ? r.data?.audienceClientId : undefined };
        setLocal(next);
        onChange?.(next);
      },
    );
  const unpublish = () =>
    run(
      () => unpublishDocumentAction(documentId),
      () => {
        const next: PublicationState = { visibility: "mentor_only" };
        setLocal(next);
        onChange?.(next);
      },
    );

  return (
    <div className={cx("flex flex-wrap items-center gap-2 text-xs", compact && "mt-2")}>
      {published ? (
        <>
          <Tag color="var(--color-emerald, #059669)">Publicado · {audienceLabel(audience, current?.audienceClientId).toLowerCase()}</Tag>
          <button type="button" disabled={pending} onClick={unpublish} className="cursor-pointer font-semibold text-slate-500 hover:text-rose-600 hover:underline disabled:opacity-50">
            {pending ? "Un momento…" : "Despublicar"}
          </button>
        </>
      ) : (
        <>
          {!compact && <Tag>Solo tú lo ves</Tag>}
          {audience.clients.length === 0 ? (
            <span className="text-slate-500">Cuando alguien acepte la invitación podrás publicárselo.</span>
          ) : (
            <>
              {group && (
                <label className="inline-flex items-center gap-1 text-slate-600">
                  <span className="sr-only">Para quién</span>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-8 rounded-full border border-slate-300 bg-white px-2 text-xs text-slate-800"
                  >
                    <option value={ALL}>Todo el grupo</option>
                    {audience.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={publish}
                className="h-8 cursor-pointer rounded-full bg-blue-600 px-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Publicando…" : "Publicar al cliente"}
              </button>
            </>
          )}
        </>
      )}
      {error && <p className="basis-full text-rose-700">{error}</p>}
    </div>
  );
}
