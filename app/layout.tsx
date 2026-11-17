import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes autoalojadas (OFL, de Fontsource): el build no depende de descargar Google Fonts.
const anton = localFont({ src: "./fonts/anton-latin-400-normal.woff2", weight: "400", variable: "--font-anton", display: "swap", fallback: ["Impact", "Arial Narrow", "sans-serif"] });
const inter = localFont({ src: "./fonts/inter-latin-wght-normal.woff2", weight: "100 900", variable: "--font-inter", display: "swap", fallback: ["system-ui", "sans-serif"] });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", variable: "--font-mono-face", display: "swap", fallback: ["ui-monospace", "monospace"] });

export const metadata: Metadata = {
  title: "AdvisorMind · La memoria inteligente del asesor",
  description: "La memoria inteligente del asesor. Diagnóstico, mentoría y validación con IA para ordenar y personas para decidir.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/advisormind-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/advisormind-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${anton.variable} ${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
