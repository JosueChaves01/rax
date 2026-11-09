import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import { getCycleOverview, type CycleSessionView } from "@/lib/services/cycle";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { formatDate } from "@/shared/ui/primitives";

/** Vista del ciclo B2B (inicio y /sesiones), una sola vez por solicitud. */
export const loadCycleOverview = cache(async (projectId: string) => {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  try {
    return await getCycleOverview(d, projectId);
  } catch (e) {
    if (isDomainError(e) && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
});

/** «Sesión 2 · Sesión de seguimiento». */
export function sessionTitle(s: Pick<CycleSessionView, "number" | "kind">): string {
  if (s.kind === "kickoff") return "Sesión 1 · Acuerdos";
  return `${s.number ? `Sesión ${s.number}` : "Sesión"} · ${SESSION_KIND_LABEL[s.kind] ?? "Sesión"}`;
}

/** Estado legible de una sesión, con su fecha. */
export function sessionWhen(s: CycleSessionView): string {
  if (s.status === "completed") return s.completedAt ? `Realizada el ${formatDate(s.completedAt)}` : "Realizada";
  if (s.status === "in_progress") return "En curso ahora";
  if (!s.scheduledAt) return "Por agendar";
  return `${formatDate(s.scheduledAt)}`;
}
