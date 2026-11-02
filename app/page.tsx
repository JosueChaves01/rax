import localFont from "next/font/local";
import { LandingSections } from "@/features/landing/baseline/sections";
import { LandingShell } from "@/features/landing/baseline/shell";
import "@/features/landing/baseline/baseline.css";

/**
 * Landing pública de RAX con el sistema visual «Baseline»: Onest, navy profundo, tarjetas redondeadas
 * sobre un marco blanco, escala rem adaptativa, loader, revelados con máscara y scroll suave (Lenis).
 * Los estilos están acotados a .bl-root: el resto de la app no cambia.
 */

// Onest autoalojada (OFL, de @fontsource/onest): el build no depende de descargar Google Fonts,
// que a veces falla en Vercel con «Cannot read properties of null (reading '1')».
const onest = localFont({
  src: [
    { path: "../features/landing/baseline/fonts/onest-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../features/landing/baseline/fonts/onest-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-onest",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

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
