import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import type { MentorSession, ProjectKnowledgeDocument } from "@/types/domain";
import type { CycleSignals } from "@/types/b2b";
import { buildBriefingHistory } from "@/lib/services/briefing-history";

/** `cycleSignalsForBriefing` es de Dev B (cycle.ts): se reemplaza por un doble controlable. */
const h = vi.hoisted(() => ({ signals: null as CycleSignals | null, calls: [] as Array<{ projectId: string; since?: string }> }));
vi.mock("@/lib/services/cycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/cycle")>()),
  cycleSignalsForBriefing: async (_d: unknown, projectId: string, opts: { since?: string } = {}) => {
    h.calls.push({ projectId, since: opts.since });
    if (!h.signals) throw new Error("not_implemented");
    return h.signals;
  },
}));

afterAll(closeWorlds);
beforeEach(() => {
  vi.stubEnv("RAX_B2B_FLOW", "on");
  h.signals = null;
  h.calls.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

const AT = "2026-11-02T10:00:00.000Z";
const session = (id: string, extra: Partial<MentorSession> = {}): MentorSession =>
  ({ id, projectId: "p1", mentorId: "men1", kind: "follow_up", status: "pending", createdAt: AT, agenda: [], ...extra }) as MentorSession;
const doc = { id: "pdoc_1", projectId: "p1", title: "Guía de precios", filename: "guia.md", content: "Contenido", fileType: "markdown", tokenCount: 1, source: "upload", createdBy: "men1", createdAt: AT, updatedAt: AT } as ProjectKnowledgeDocument;

describe("briefing con señales del ciclo (Fase 4, Dev A)", () => {
  it("suma comentarios del cliente y resultados de evaluaciones desde la última sesión cerrada", async () => {
    const w = await world();
    h.signals = {
      newComments: [{ targetType: "document", targetId: "pdoc_1", authorId: "ent1", body: "No entendí el cálculo del margen", createdAt: "2026-11-05T09:00:00.000Z" }],
      assessmentResults: [{ assessmentId: "as_1", title: "Costos básicos", clientId: "ent1", status: "reviewed", score: 8 }],
    };
    const previous = session("ses_prev", { status: "completed", completedAt: "2026-11-01T12:00:00.000Z", scheduledAt: "2026-11-01T10:00:00.000Z" });
    const history = await buildBriefingHistory(w.as("men1"), session("ses_now", { scheduledAt: "2026-11-08T10:00:00.000Z" }), [previous], [], [doc]);
    expect(h.calls).toEqual([{ projectId: "p1", since: "2026-11-01T12:00:00.000Z" }]);
    expect(history.previousSessionPending).toEqual([
      "Comentario de Emprendedora Uno sobre el material «Guía de precios» (2026-11-05): No entendí el cálculo del margen",
      "Evaluación «Costos básicos» de Emprendedora Uno: revisada, puntaje 8",
    ]);
  });

  it("si el proveedor todavía no existe (stub) o falla, el briefing sigue sin señales", async () => {
    const w = await world();
    const history = await buildBriefingHistory(w.as("men1"), session("ses_now"), [], [], []);
    expect(h.calls).toHaveLength(1);
    expect(history.previousSessionPending).toBeUndefined();
  });

  it("con la bandera apagada no consulta el ciclo", async () => {
    vi.stubEnv("RAX_B2B_FLOW", "");
    const w = await world();
    await buildBriefingHistory(w.as("men1"), session("ses_now"), [], [], []);
    expect(h.calls).toHaveLength(0);
  });
});
