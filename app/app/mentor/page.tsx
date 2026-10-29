import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { getMentorPortfolio } from "@/lib/services/portfolio";
import { PortfolioView } from "./portfolio-view";

export const metadata = { title: "Cartera de Mentoría · RAX" };

export default async function MentorPortfolioPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  if (d.actor.role !== "mentor" && d.actor.role !== "admin") {
    redirect("/app");
  }

  const portfolio = await getMentorPortfolio(d);

  return <PortfolioView portfolio={portfolio} mentorName={d.actor.name} />;
}

