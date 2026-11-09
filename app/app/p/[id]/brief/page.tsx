import { notFound, redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { isB2BFlow } from "@/lib/flags";
import { isDomainError } from "@/lib/errors";
import { getIntakeBriefsForMentor } from "@/lib/services/mentor-projects";
import { BriefView } from "./brief-view";

export const metadata = { title: "Brief del intake · RAX" };

/** Brief del intake para el mentor (flujo B2B): lectura, contexto faltante y «Marcar revisado». */
export default async function IntakeBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isB2BFlow()) notFound();
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (d.actor.role !== "mentor") redirect(`/app/p/${id}`);
  try {
    const view = await getIntakeBriefsForMentor(d, id);
    return <BriefView view={view} />;
  } catch (e) {
    if (isDomainError(e) && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
}
