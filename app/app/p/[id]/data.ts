import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { getWorkspace } from "@/lib/services/projects";
import { isDomainError } from "@/lib/errors";

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
