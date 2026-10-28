import Link from "next/link";
import { Heading } from "@/shared/ui/primitives";

export default function ProjectNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <p className="eyebrow">404</p>
      <Heading level={1} highlight="no disponible." className="mt-4">
        Proyecto
      </Heading>
      <p className="mt-4 text-muted">Este proyecto no existe o no tenés acceso. Los mentores solo ven los proyectos que se les asignaron.</p>
      <Link href="/app" className="mt-8 inline-flex h-10 items-center rounded-full bg-accent px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white">
        Volver a mis proyectos
      </Link>
    </main>
  );
}
