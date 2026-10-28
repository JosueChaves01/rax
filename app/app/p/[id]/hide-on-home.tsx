"use client";

import { usePathname } from "next/navigation";

/** Oculta su contenido en el Inicio del proyecto, que ya muestra lo mismo en grande. */
export function HideOnHome({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return usePathname() === `/app/p/${projectId}` ? null : <>{children}</>;
}
