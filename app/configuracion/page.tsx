import Link from "next/link";
import { redirect } from "next/navigation";
import { missingConfig } from "@/lib/supabase/config";
import { Notice } from "@/shared/ui/primitives";

export const metadata = { title: "Configuración pendiente · RAX" };
export const dynamic = "force-dynamic";

/** Se muestra cuando faltan variables de entorno. Solo nombra las variables, nunca valores. */
export default function SetupPage() {
  const missing = missingConfig();
  if (!missing.length) redirect("/entrar");
  return (
    <main className="ambient min-h-dvh px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="display text-2xl">
          <span className="text-accent">R</span>AX
        </Link>
        <h1 className="display mt-10 text-[clamp(2.5rem,9vw,4rem)]">
          Falta <span className="text-highlight">conectar Supabase.</span>
        </h1>
        <div className="mt-6">
          <Notice tone="warn">
            RAX necesita estas variables de entorno para funcionar. Ponelas en <code>.env.local</code> o en la configuración del hosting y reiniciá:
            <ul className="mt-3 list-disc space-y-1 pl-5 font-mono text-sm">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Notice>
        </div>
        <p className="mt-6 text-sm text-muted">
          La URL y la clave publishable están en Supabase → Project Settings → API. La clave secreta (service role) es solo para el servidor: nunca la
          pongas en una variable que empiece con <code>NEXT_PUBLIC_</code>.
        </p>
      </div>
    </main>
  );
}
