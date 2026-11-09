import type { B2BTool } from "../types";

/**
 * Herramientas del agente del mentor (Dev A). Previstas: search_mentor_knowledge,
 * summarize_document, draft_material (usa document-writer.ts) y propose_publish (tarjeta que el
 * mentor confirma). Solo se ofrecen con RAX_B2B_FLOW encendida.
 */
export const MENTOR_TOOLS: B2BTool[] = [];
