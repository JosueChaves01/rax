import { redirect } from "next/navigation";

/** El editor de plantillas no guardaba nada: el recurso se abre en la biblioteca, donde se descarga. */
export default async function DocumentEditorRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/documentos?recurso=${encodeURIComponent(id)}`);
}
