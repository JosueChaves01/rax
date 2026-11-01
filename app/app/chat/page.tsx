import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import ChatClient from "./chat-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; session?: string; thread?: string }>;
}) {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  const projects = d.actor.role === "admin" ? [] : await d.repo.projects.list();
  const sp = searchParams ? await searchParams : {};

  return (
    <ChatClient
      projects={[...projects]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ id, name, description, updatedAt }) => ({ id, name, description, updatedAt }))}
      initialProjectId={sp?.project}
      initialSessionId={sp?.session}
      initialThreadId={sp?.thread}
    />
  );
}
