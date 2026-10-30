import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import ChatClient from "./chat-client";

export default async function ChatPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  const projects = d.actor.role === "admin" ? [] : await d.repo.projects.list();
  return <ChatClient projects={projects.map(({ id, name }) => ({ id, name }))} />;
}
