import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { assignMentor } from "@/lib/services/admin";
import { createProject } from "@/lib/services/projects";
import { appendAgentAssistantMessage, appendAgentUserMessage, getOrCreateAgentThread, listAgentMessages } from "@/lib/services/agent-chat";

afterAll(closeWorlds);

describe("chat persistente del agente principal", () => {
  it("crea un hilo único y separado por actor/proyecto, con mensajes y propuestas", async () => {
    const { as, id, repo } = await world();
    const entrepreneur = as("ent1");
    const mentor = as("men1");
    const admin = as("adm");
    const project = await createProject(entrepreneur, { name: "Agente", description: "Proyecto de prueba", nature: "exploring_idea" });

    const first = await getOrCreateAgentThread(entrepreneur, project.id);
    const again = await getOrCreateAgentThread(entrepreneur, project.id);
    expect(again.id).toBe(first.id);
    expect((await repo.agentThreads.list({ projectId: project.id })).map((t) => t.creatorId)).toEqual([id("ent1")]);

    const userMessage = await appendAgentUserMessage(entrepreneur, first.id, "  Necesito ordenar la idea.  ");
    expect(userMessage).toMatchObject({ author: "user", authorId: id("ent1"), content: "Necesito ordenar la idea.", proposals: [], status: "complete" });
    const assistantMessage = await appendAgentAssistantMessage(entrepreneur, first.id, {
      content: "Podrías validar esta hipótesis.", proposals: [{ type: "hypothesis", title: "Demanda", needsHumanApproval: true }],
    });
    expect(assistantMessage).toMatchObject({ author: "assistant", authorId: id("ent1"), status: "complete" });
    expect(assistantMessage.proposals).toHaveLength(1);
    expect(await repo.agentMessages.list({ projectId: project.id })).toHaveLength(2);

    await assignMentor(admin, project.id, id("men1"));
    const mentorThread = await getOrCreateAgentThread(mentor, project.id);
    expect(mentorThread.id).not.toBe(first.id);
    expect(mentorThread.creatorId).toBe(id("men1"));
    await expect(listAgentMessages(mentor, first.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("almacena fallos como estado/error verificable y deja el hilo recuperable", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, { name: "Error", description: "Proyecto de prueba", nature: "unknown" });
    const thread = await getOrCreateAgentThread(entrepreneur, project.id);
    const failed = await appendAgentAssistantMessage(entrepreneur, thread.id, {
      content: "", error: { code: "provider_unavailable", message: "El proveedor no respondió." },
    });
    expect(failed).toMatchObject({ status: "failed", errorCode: "provider_unavailable", errorMessage: "El proveedor no respondió." });
    expect(await getOrCreateAgentThread(entrepreneur, project.id)).toMatchObject({ status: "error", lastErrorCode: "provider_unavailable" });
    const recovered = await appendAgentAssistantMessage(entrepreneur, thread.id, { content: "Retomemos." });
    expect(recovered.status).toBe("complete");
    expect(await getOrCreateAgentThread(entrepreneur, project.id)).toMatchObject({ status: "active", lastErrorCode: undefined });
  });

  it("rechaza roles ajenos, proyectos no asignados, texto vacío y propuestas que exceden el límite", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const outsider = as("men2");
    const admin = as("adm");
    const project = await createProject(entrepreneur, { name: "Privado", description: "Proyecto de prueba", nature: "unknown" });
    const thread = await getOrCreateAgentThread(entrepreneur, project.id);
    await expect(getOrCreateAgentThread(admin, project.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getOrCreateAgentThread(outsider, project.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(appendAgentUserMessage(entrepreneur, thread.id, "  ")).rejects.toMatchObject({ code: "validation" });
    await expect(appendAgentAssistantMessage(entrepreneur, thread.id, {
      content: "Respuesta", proposals: Array.from({ length: 51 }, (_, i) => ({ title: String(i) })),
    })).rejects.toMatchObject({ code: "validation" });
  });
});
