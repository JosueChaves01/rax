import type { AgentArtifact, Project } from "@/types/domain";
import type { ServiceDeps } from "@/lib/services/base";
import type { AiProposalItem } from "@/lib/n8n/contracts";
import type { WorkflowToolDefinition } from "../workflow-tools";

/** Lo que recibe una herramienta B2B al ejecutarse. Los permisos los aplica el servicio que llame. */
export interface B2BToolContext {
  deps: ServiceDeps;
  project: Project;
  threadId?: string;
  /** Plazo del turno (epoch ms). */
  deadline?: number;
}

/** Mismo resultado que las herramientas actuales del orquestador. */
export interface B2BToolResult {
  summary: string;
  proposals: AiProposalItem[];
  data?: unknown;
  artifacts?: AgentArtifact[];
}

/** Herramienta del pivot B2B: definición para el modelo + ejecución. */
export interface B2BTool {
  definition: WorkflowToolDefinition;
  /** Cómo se anuncia mientras corre («Buscando en tu metodología…»). */
  status?: string;
  run(ctx: B2BToolContext, args: Record<string, unknown>): Promise<B2BToolResult>;
}
