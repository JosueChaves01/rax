import Link from "next/link";
import { DEMO_DESCRIPTIONS, DEMO_PROFILES } from "@/lib/data/demo-seed";
import { ROLE_LABEL } from "@/features/labels";
import { enterAsDemo } from "@/app/actions";
import { DemoTag, Notice } from "@/shared/ui/primitives";

export const metadata = { title: "Entrar · RAX" };

export default function EnterPage() {
  return (
    <main className="ambient min-h-dvh px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="display text-2xl">
          <span className="text-accent">R</span>AX
        </Link>
        <h1 className="display mt-10 text-[clamp(2.75rem,8vw,5.5rem)]">
          Elegí <span className="text-highlight">quién sos.</span>
        </h1>
        <div className="mt-6">
          <Notice tone="warn">
            <strong>Acceso de demostración, no es un inicio de sesión real.</strong> Elegís una persona ficticia para recorrer el prototipo. Los
            permisos sí se aplican en el servidor: cada perfil ve solo lo que le corresponde. Los datos viven en memoria y se reinician con el
            servidor.
          </Notice>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {DEMO_PROFILES.map((p) => (
            <li key={p.id}>
              <form action={enterAsDemo.bind(null, p.id)}>
                <button
                  type="submit"
                  className="group block h-full w-full rounded-2xl border border-line bg-panel p-5 text-left transition-colors hover:border-accent/60 focus-visible:border-highlight"
                >
                  <span className="flex items-center justify-between">
                    <span className="eyebrow">{ROLE_LABEL[p.role]}</span>
                    <DemoTag />
                  </span>
                  <span className="display mt-3 block text-3xl group-hover:text-highlight">{p.name}</span>
                  <span className="mt-2 block text-sm text-muted">{DEMO_DESCRIPTIONS[p.id]}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
