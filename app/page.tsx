import { Onest } from "next/font/google";
import { LandingSections } from "@/features/landing/baseline/sections";
import { LandingShell } from "@/features/landing/baseline/shell";
import "@/features/landing/baseline/baseline.css";

/**
 * Landing pública de RAX con el sistema visual «Baseline»: Onest, navy profundo, tarjetas redondeadas
 * sobre un marco blanco, escala rem adaptativa, loader, revelados con máscara y scroll suave (Lenis).
 * Los estilos están acotados a .bl-root: el resto de la app no cambia.
 */

const onest = Onest({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-onest", display: "swap" });

export default function Home() {
  return (
    <>
      <noscript>
        <style>{`.bl-loader{display:none!important}`}</style>
      </noscript>
      <LandingShell fontClass={onest.variable}>
        <LandingSections />
      </LandingShell>
    </>
  );
}
