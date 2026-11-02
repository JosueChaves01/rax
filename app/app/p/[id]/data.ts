import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { getWorkspace } from "@/lib/services/projects";
import { isDomainError } from "@/lib/errors";
import { listProjectDocuments } from "@/lib/services/project-knowledge";

/** Carga el espacio de trabajo una sola vez por solicitud (layout + página). */
export const loadWorkspace = cache(async (projectId: string) => {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  try {
    return { w: await getWorkspace(d, projectId), actor: d.actor };
  } catch (e) {
    if (isDomainError(e) && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
});

/** Fila de un documento del proyecto para las pantallas (sin el contenido completo). */
export interface ProjectDocRow {
  id: string;
  title: string;
  filename: string;
  source: "upload" | "chat_extracted" | "note";
  updatedAt: string;
  authorName: string;
  /** Lo compartió un mentor asignado al proyecto. */
  fromMentor: boolean;
  /** Quien mira puede eliminarlo (dueño del proyecto o quien lo subió). */
  canDelete: boolean;
}

/** Documentos vigentes del proyecto, del más nuevo al más viejo, marcando los que compartió el mentor. */
export const loadProjectDocuments = cache(async (projectId: string): Promise<ProjectDocRow[]> => {
  const { w, actor } = await loadWorkspace(projectId);
  const d = await getDeps();
  if (!d) redirect("/entrar");
  const docs = await listProjectDocuments(d, projectId);
  const mentors = new Set(w.mentors);
  const isOwner = w.project.ownerId === actor.id;
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title || doc.filename,
    filename: doc.filename,
    source: doc.source,
    updatedAt: doc.updatedAt,
    authorName: doc.createdBy === actor.id ? "Vos" : (w.people[doc.createdBy]?.name ?? "Otra persona"),
    fromMentor: mentors.has(doc.createdBy),
    canDelete: isOwner || doc.createdBy === actor.id,
  }));
});
