import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import LearningClient from "./learning-client";

export default async function LearningPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  const projects = d.actor.role === "admin" ? [] : await d.repo.projects.list();
  return <LearningClient projects={projects.map(({ id, name }) => ({ id, name }))} />;
}
