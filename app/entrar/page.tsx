import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getActor, homeFor } from "@/lib/runtime";
import { missingConfig } from "@/lib/supabase/config";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Bienvenido a RAX · Acceso" };

export default async function EnterPage({ searchParams }: { searchParams: Promise<{ next?: string; modo?: string; error?: string }> }) {
  await connection();
  if (missingConfig().length) redirect("/configuracion");
  const actor = await getActor();
  if (actor) redirect(homeFor(actor));
  const { next, modo, error } = await searchParams;

  return (
    <main className="min-h-dvh flex flex-col lg:flex-row bg-[#0b132b] text-white">
      {/* Columna Izquierda: Hero Cinematográfico (Panel 0 del Mock) */}
      <section className="relative flex-1 flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden bg-gradient-to-br from-[#0b132b] via-[#1c2541] to-[#0f172a]">
        {/* Patrón de fondo / ambientación de montañas */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-400 via-indigo-900 to-black" />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-96 opacity-30 bg-repeat-x bg-bottom pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 400' preserveAspectRatio='none'%3E%3Cpath d='M0,400 L0,280 L200,120 L350,220 L550,80 L750,260 L950,140 L1100,240 L1200,160 L1200,400 Z' fill='%233b82f6' opacity='0.3'/%3E%3Cpath d='M0,400 L0,320 L180,180 L380,300 L600,140 L800,310 L1000,190 L1200,280 L1200,400 Z' fill='%231e293b' opacity='0.7'/%3E%3C/svg%3E")`,
            backgroundSize: "cover",
          }}
        />

        {/* Encabezado con Logotipo */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="text-3xl font-black tracking-tight text-white font-sans">
              <span className="text-blue-500">R</span>AX
            </span>
          </Link>
        </div>

        {/* Mensaje Principal */}
        <div className="relative z-10 max-w-lg my-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Mentoría que impulsa.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed font-light">
            Conecta mentores y emprendedores para transformar conocimiento en acción, acelerando el crecimiento de negocios de manera estructurada, medible y humana.
          </p>
        </div>

        {/* 4 Píldoras / Iconos de Características al pie del Mock */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-700/60">
          <div className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-xs">
            <span className="w-8 h-8 rounded-full border border-blue-400/40 text-blue-400 flex items-center justify-center text-sm font-semibold mb-2">
              🛡️
            </span>
            <span className="text-xs font-medium text-slate-200">Mentoría</span>
          </div>
          <div className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-xs">
            <span className="w-8 h-8 rounded-full border border-purple-400/40 text-purple-400 flex items-center justify-center text-sm font-semibold mb-2">
              🎓
            </span>
            <span className="text-xs font-medium text-slate-200">Aprendizaje</span>
          </div>
          <div className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-xs">
            <span className="w-8 h-8 rounded-full border border-cyan-400/40 text-cyan-400 flex items-center justify-center text-sm font-semibold mb-2">
              💡
            </span>
            <span className="text-xs font-medium text-slate-200">IA</span>
          </div>
          <div className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-xs">
            <span className="w-8 h-8 rounded-full border border-emerald-400/40 text-emerald-400 flex items-center justify-center text-sm font-semibold mb-2">
              📈
            </span>
            <span className="text-xs font-medium text-slate-200">Resultados</span>
          </div>
        </div>
      </section>

      {/* Columna Derecha: Tarjeta de Acceso y Selección de Rol (Panel 0) */}
      <section className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-[#f8fafc]">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-8 text-slate-900">
          <div className="text-center sm:text-left mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Bienvenido a RAX
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Inicia sesión para continuar
            </p>
          </div>

          <AuthForm
            initialMode={modo === "registro" ? "signup" : "signin"}
            next={next}
            linkError={
              error === "enlace"
                ? "El enlace no es válido o ya venció. Entrá con tu correo y contraseña."
                : error === "google"
                  ? "No se completó el ingreso con Google. Probá de nuevo o usá tu correo."
                  : undefined
            }
          />
        </div>
      </section>
    </main>
  );
}
