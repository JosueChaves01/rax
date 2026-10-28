import type { DiagnosisItem, InterviewDimension, Message } from "@/types/domain";
import type { AiTurn } from "./schema";

/**
 * Contexto seleccionado para una invocación. No se envía todo el historial:
 * ver lib/ai/context.ts para las reglas de selección.
 */
export interface InterviewContext {
  projectName: string;
  projectSummary: string | null;
  /** Últimos mensajes de la conversación (ventana acotada). */
  recentMessages: Message[];
  /** Mensaje nuevo del emprendedor que motiva la invocación. */
  latestMessage: Message;
  /** Elementos vigentes. Los protegidos (confirmados/corregidos) no pueden modificarse en sitio. */
  currentItems: Array<Pick<DiagnosisItem, "id" | "category" | "title" | "content" | "infoType" | "reviewStatus" | "uncertainty"> & { protected: boolean }>;
  /** Interpretaciones rechazadas: la IA no debe volver a tratarlas como hechos. */
  rejectedInterpretations: Array<{ id: string; title: string; content: string }>;
  coveredDimensions: InterviewDimension[];
  pendingDimensions: InterviewDimension[];
  mentorNotes: string[];
  summaryReady: boolean;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AiResult {
  turn: AiTurn;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface AiProvider {
  readonly id: "simulated" | "openrouter";
  /** Texto visible que describe el proveedor (la simulación se declara como tal). */
  readonly label: string;
  interpret(ctx: InterviewContext): Promise<AiResult>;
}

export class AiUnavailableError extends Error {
  constructor(
    readonly reason: "not_configured" | "rate_limited" | "provider_error" | "invalid_output" | "refused",
    message: string,
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}
