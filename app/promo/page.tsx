import type { Metadata } from "next";
import { PromoVideo } from "@/features/promo/promo-video";

export const metadata: Metadata = {
  title: "RAX · Cómo funciona en un minuto",
  description: "Video corto que muestra cómo usar RAX: proyecto, etapas, asistente IA, mentor, llamadas con transcripción y notas.",
};

export default async function PromoPage({ searchParams }: { searchParams: Promise<{ grabar?: string }> }) {
  const { grabar } = await searchParams;
  return <PromoVideo record={grabar === "1"} />;
}
