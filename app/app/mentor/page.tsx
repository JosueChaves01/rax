import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { isB2BFlow } from "@/lib/flags";
import { getMentorPortfolio } from "@/lib/services/portfolio";
import { listMentorProjects } from "@/lib/services/mentor-projects";
import { PortfolioView } from "./portfolio-view";
import { ClientsView } from "./clients-view";

export const metadata = { title: "Cartera de Mentoría · RAX" };

export default async function MentorPortfolioPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  // Flujo B2B: «Clientes» del mentor (proyectos que creó, invitaciones e intake).
  if (isB2BFlow()) {
    if (d.actor.role !== "mentor") redirect("/app");
    const projects = await listMentorProjects(d);
    return <ClientsView projects={projects} />;
  }

  if (d.actor.role !== "mentor" && d.actor.role !== "admin") {
    redirect("/app");
  }

  const portfolio = await getMentorPortfolio(d);

  return <PortfolioView portfolio={portfolio} mentorName={d.actor.name} />;
}
