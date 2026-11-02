import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import { agentTurnPayload, runAgentTurn } from "@/lib/services/agent-turn";
import type { AgentTurnEvent, SessionContext } from "@/lib/ai/claude-orchestrator";
import * as V from "@/lib/validation/inputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  projectId: V.Ids,
  threadId: V.Ids,
  message: z.string().min(1).max(10_000),
  sessionContext: z
    .object({ location: z.string().max(60).optional(), pageTitle: z.string().max(200).optional() })
    .passthrough()
    .optional(),
});

/** Eventos que recibe el navegador, uno por línea (NDJSON). */
export type AgentStreamEvent =
  | AgentTurnEvent
  | { type: "done"; data: ReturnType<typeof agentTurnPayload> }
  | { type: "error"; error: string; code?: string };

/**
 * Un turno del agente con la respuesta en vivo: primero el mensaje de la persona ya guardado, luego el
 * estado («leyendo el proyecto», «redactando el documento»), el texto a medida que el modelo lo escribe
 * y al final el mensaje guardado con propuestas, artefactos y sugerencias.
 */
export async function POST(req: NextRequest) {
  const d = await getDeps();
  if (!d) return Response.json({ error: "Tu sesión terminó. Vuelve a entrar.", code: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "El mensaje no es válido.", code: "validation" }, { status: 400 });
  const input = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AgentStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // la persona cerró la pestaña: el turno igual termina y se guarda
        }
      };
      try {
        const turn = await runAgentTurn(d, {
          projectId: input.projectId,
          threadId: input.threadId,
          message: input.message,
          // El campo de formulario solo lo define el servidor, nunca el navegador.
          sessionContext: input.sessionContext ? ({ ...input.sessionContext, field: undefined } as SessionContext) : undefined,
          onEvent: send,
        });
        send({ type: "done", data: agentTurnPayload(turn) });
      } catch (e) {
        if (isDomainError(e)) send({ type: "error", error: e.message, code: e.code });
        else {
          console.error("[agente] turno fallido", e);
          send({ type: "error", error: "Algo salió mal. Tu mensaje quedó guardado; prueba de nuevo." });
        }
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
