import { notFound, redirect } from "next/navigation";
import { getDeps, isB2BFlow } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import { getIntakeView } from "@/lib/services/intake";
import { Empty } from "@/shared/ui/primitives";
import { IntakeChat } from "./intake-chat";

/**
 * Entrevista de intake (pivot B2B): la responde cada persona cliente antes de la Sesión 1. Chat con
 * el asistente del mentor, avance por tema y «Enviar a mi mentor». Solo con RAX_B2B_FLOW encendida.
 */
export default async function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  if (!isB2BFlow()) notFound();
  const { id } = await params;
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (d.actor.role === "mentor") {
    return <Empty title="Esta entrevista la responde tu cliente">Cuando la envíe, vas a ver su resumen antes de la Sesión 1.</Empty>;
  }

  let view;
  try {
    view = await getIntakeView(d, id);
  } catch (e) {
    if (isDomainError(e) && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }

  return (
    <IntakeChat
      projectId={id}
      mentorName={view.mentorName}
      guide={view.guide}
      initialMessages={view.messages}
      initialCoverage={view.state.coverage}
      initialStatus={view.state.status}
      simulated={view.mode === "simulated"}
    />
  );
}
