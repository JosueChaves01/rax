import type { DiagnosisItem, Message } from "@/types/domain";
import { aiMayModify } from "@/features/diagnosis/rules";
import type { AiProposal } from "./schema";

export interface VettedProposal {
  proposal: AiProposal;
  /** Si es update, el elemento existente que la IA puede modificar. */
  target?: DiagnosisItem;
  /** Ajustes aplicados por las reglas (para trazabilidad). */
  adjustments: string[];
}

const MAX_TITLE = 120;
const MAX_CONTENT = 2000;

/**
 * Filtro entre la salida del modelo y el dominio. Aplica reglas que el modelo no puede saltarse:
 * - una "declaración del emprendedor" debe citar literalmente un mensaje real del emprendedor;
 *   si no, se degrada a "interpretación de la IA";
 * - las actualizaciones solo se permiten sobre propuestas de la IA aún no revisadas;
 *   sobre elementos protegidos se convierten en una propuesta nueva relacionada;
 * - no se re-proponen contenidos que una persona ya rechazó.
 */
export function vetProposals(proposals: AiProposal[], items: DiagnosisItem[], messages: Message[]): VettedProposal[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const entrepreneurMsgs = new Map(messages.filter((m) => m.author === "entrepreneur").map((m) => [m.id, m]));
  const rejected = items.filter((i) => i.reviewStatus === "rejected").map((i) => normalize(i.content));
  const out: VettedProposal[] = [];

  for (const raw of proposals) {
    const p: AiProposal = {
      ...raw,
      title: raw.title.trim().slice(0, MAX_TITLE),
      content: raw.content.trim().slice(0, MAX_CONTENT),
    };
    const adjustments: string[] = [];
    if (!p.title || !p.content) continue;

    if (rejected.includes(normalize(p.content))) continue;

    const source = p.sourceMessageId ? entrepreneurMsgs.get(p.sourceMessageId) : undefined;
    if (p.sourceMessageId && !source) {
      p.sourceMessageId = null;
      p.quote = null;
      adjustments.push("fuente inexistente descartada");
    }
    const quoteIsLiteral = !!(source && p.quote && normalize(source.content).includes(normalize(p.quote.replace(/…$/, ""))));
    if (!quoteIsLiteral) p.quote = null;
    if ((p.infoType === "entrepreneur_statement" || p.infoType === "documented_observation") && !quoteIsLiteral) {
      p.infoType = "ai_interpretation";
      adjustments.push("sin cita literal: se registra como interpretación de la IA");
    }

    let target: DiagnosisItem | undefined;
    if (p.op === "update") {
      target = p.targetItemId ? byId.get(p.targetItemId) : undefined;
      if (!target || !aiMayModify(target)) {
        adjustments.push(target ? "elemento protegido: se crea una propuesta nueva relacionada" : "elemento inexistente: se crea como nuevo");
        p.op = "create";
        target = undefined;
      }
    }
    out.push({ proposal: p, target, adjustments });
  }
  return out;
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
