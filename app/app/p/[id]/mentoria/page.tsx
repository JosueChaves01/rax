import { redirect } from "next/navigation";
import { stageOf } from "@/features/projects/stages";
import { loadWorkspace } from "../data";

/** Ruta anterior a las etapas: lleva a la revisión que corresponde según la fase. */
export default async function MentoringRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  redirect(`/app/p/${id}/${stageOf(w.phase).id === "decidir" ? "decidir" : "orientar"}`);
}
