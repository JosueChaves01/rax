import type { B2BTool } from "../types";

/**
 * Herramientas del agente del cliente y del entrevistador de intake (Dev B). Previstas:
 * record_intake_answer, finish_intake, explain_resource y prepare_for_session. El asistente del
 * cliente solo usa material publicado y el RAG del mentor filtrado en el servidor.
 * Solo se ofrecen con RAX_B2B_FLOW encendida.
 */
export const CLIENT_TOOLS: B2BTool[] = [];
