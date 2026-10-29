import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h2 className="display text-4xl font-bold tracking-tight">404 · No encontrado</h2>
      <p className="mt-4 text-sm text-muted">El recurso que buscas no existe o ha sido movido.</p>
      <Link href="/" className="mt-6 inline-block rounded-md bg-highlight px-4 py-2 font-mono text-sm font-semibold text-black transition-opacity hover:opacity-90">
        Volver al inicio
      </Link>
    </div>
  );
}

