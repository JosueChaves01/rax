import { loadProjectDocuments, loadWorkspace } from "../data";
import { DocumentsPanel } from "../documents-panel";

export const metadata = { title: "Documentos del proyecto · RAX" };

/** Todos los documentos del proyecto: los que compartió el mentor, los del equipo, del asistente y de las llamadas. */
export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ w }, docs] = await Promise.all([loadWorkspace(id), loadProjectDocuments(id)]);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Archivo</p>
        <h2 className="display mt-2 text-4xl">
          Documentos <span className="text-highlight">del proyecto.</span>
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Lo que compartió el mentor, lo que subió el equipo, lo que generó el asistente y las transcripciones de las llamadas. Todo se descarga en PDF o
          Word y el asistente lo usa como contexto.
        </p>
      </div>
      <DocumentsPanel
        projectId={id}
        docs={docs}
        canShare={w.permissions["agent.chat"] ?? false}
        viewerIsMentor={w.isMentorView}
        title="Documentos"
      />
    </div>
  );
}
