import { describe, expect, it } from "vitest";
import { createPgRepository } from "@/lib/data/supabase-repository";
import type { Db, Row } from "@/lib/data/db";

describe("contrato de persistencia del chat de agente", () => {
  it("mapea hilos y mensajes a sus tablas y conserva propuestas JSON/errores", async () => {
    const tables = new Map<string, Row[]>();
    const db: Db = {
      select: async (table, match) => (tables.get(table) ?? []).filter((row) => Object.entries(match).every(([key, value]) => row[key] === value)),
      insert: async (table, row) => {
        const saved = { ...row };
        tables.set(table, [...(tables.get(table) ?? []), saved]);
        return saved;
      },
      update: async () => [],
    };
    const repo = createPgRepository(db);
    const createdAt = "2026-10-29T12:00:00.000Z";
    const thread = await repo.agentThreads.insert({
      id: "thread-1", projectId: "project-1", creatorId: "actor-1", title: "Chat inicial", status: "error",
      lastErrorCode: "timeout", lastErrorMessage: "Provider timed out", createdAt, updatedAt: createdAt,
    });
    expect(tables.get("agent_threads")?.[0]).toMatchObject({ project_id: "project-1", creator_id: "actor-1", last_error_code: "timeout" });
    expect(await repo.agentThreads.get(thread.id)).toMatchObject({ creatorId: "actor-1", status: "error", lastErrorMessage: "Provider timed out" });

    await repo.agentMessages.insert({
      id: "message-1", threadId: thread.id, projectId: thread.projectId, author: "assistant", authorId: thread.creatorId,
      content: "Respuesta", proposals: [{ type: "task", title: "Revisar", needsHumanApproval: true }],
      status: "failed", errorCode: "timeout", errorMessage: "Provider timed out", createdAt,
    });
    const message = await repo.agentMessages.get("message-1");
    expect(message).toMatchObject({ author: "assistant", status: "failed", proposals: [{ type: "task", title: "Revisar" }], errorCode: "timeout" });
  });
});
