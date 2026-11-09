import { loadProjectDocuments, loadWorkspace } from "../data";
import { DocumentsPanel, type DocumentsPublishing } from "../documents-panel";
import { isB2BFlow } from "@/lib/flags";
import { getDeps } from "@/lib/runtime";
import { getProjectPublishing } from "@/lib/services/publishing";

export const metadata = { title: "Documentos del proyecto · RAX" };

/** Pivot B2B: solo el mentor del proyecto ve los botones de publicar (null para los demás). */
async function loadPublishing(projectId: string): Promise<DocumentsPublishing | undefined> {
  if (!isB2BFlow()) return undefined;
  const d = await getDeps();
  const p = d ? await getProjectPublishing(d, projectId).catch(() => null) : null;
  if (!p) return undefined;
  return {
    mode: p.mode,
    clients: p.clients,
    documents: Object.fromEntries(
      Object.entries(p.documents).map(([id, doc]) => [id, { visibility: doc.visibility, audienceClientId: doc.audienceClientId, docKind: doc.docKind }]),
    ),
  };
}

/** Todos los documentos del proyecto: los que compartió el mentor, los del equipo, del asistente y de las llamadas. */
export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ w }, docs, publishing] = await Promise.all([loadWorkspace(id), loadProjectDocuments(id), loadPublishing(id)]);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Archivo</p>
        <h2 className="display mt-2 text-4xl">
          Documentos <span className="text-highlight">del proyecto.</span>
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          {publishing
            ? "Tu material, lo que generó el asistente y las transcripciones de las llamadas. Todo queda solo para ti hasta que lo publiques: entonces tu cliente lo ve en «Material» y te puede comentar."
            : "Lo que compartió el mentor, lo que subió el equipo, lo que generó el asistente y las transcripciones de las llamadas. Todo se descarga en PDF o Word y el asistente lo usa como contexto."}
        </p>
      </div>
      <DocumentsPanel
        projectId={id}
        docs={docs}
        canShare={w.permissions["agent.chat"] ?? false}
        viewerIsMentor={w.isMentorView}
        title="Documentos"
        publishing={publishing}
      />
    </div>
  );
}
