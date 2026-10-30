"use client";

import { useState } from "react";
import { sendMainAgentMessageAction } from "@/app/actions";
import type { MainAgentField, RaxCapabilityId, MainAgentStage } from "@/lib/n8n/main-agent";
import type { AiProposalItem } from "@/lib/n8n/contracts";

interface AgentFieldAssistProps {
  projectId: string;
  flowId: RaxCapabilityId;
  stage: MainAgentStage;
  section: string;
  entityId?: string;
  fieldPath: string;
  fieldSchema: MainAgentField;
  currentValue: string;
  onApply: (value: string) => void;
}

export function AgentFieldAssist(props: AgentFieldAssistProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AiProposalItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setProposal(null);
    try {
      const result = await sendMainAgentMessageAction({
        projectId: props.projectId,
        flowId: props.flowId,
        stage: props.stage,
        section: props.section,
        entityId: props.entityId,
        fieldPath: props.fieldPath,
        fieldSchema: props.fieldSchema,
        currentValue: props.currentValue,
        message: message.trim() || `Prepara un borrador para el campo «${props.fieldSchema.label}».`,
      });
      if (!result.ok || !result.data) {
        setError(result.ok ? "El agente no devolvió un resultado." : result.error);
        return;
      }
      if (!result.data.ok) {
        setError(result.data.message);
        return;
      }
      setReply(result.data.reply);
      const fieldProposal = result.data.proposals.find((item) => item.type === "field_value" && item.fieldPath === props.fieldPath);
      setProposal(fieldProposal ?? null);
      if (!fieldProposal) setError("No se recibió un borrador estructurado para este campo. El texto del agente no se aplicó.");
    } catch {
      setError("No se pudo comunicar con el agente principal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-1">
      <button type="button" className="text-xs font-medium text-accent underline" onClick={() => setOpen((value) => !value)}>
        {open ? "Cerrar ayuda del agente" : "Pedir borrador al agente"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-bg p-3">
          <p className="text-xs text-muted">El borrador se revisa aquí; solo se aplica al formulario si lo eliges.</p>
          <label className="sr-only" htmlFor={`${props.fieldPath}-agent-prompt`}>Qué necesitas para este campo</label>
          <textarea
            id={`${props.fieldPath}-agent-prompt`}
            className="w-full rounded border border-line-strong bg-panel p-2 text-xs"
            maxLength={1000}
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={`¿Qué necesitas para «${props.fieldSchema.label}»?`}
            disabled={loading}
          />
          <button type="button" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" onClick={ask} disabled={loading}>
            {loading ? "Consultando…" : "Preparar borrador"}
          </button>
          {error && <p role="status" className="text-xs text-amber-800">{error}</p>}
          {reply && <p className="whitespace-pre-wrap text-xs text-muted">{reply}</p>}
          {proposal && (
            <div className="space-y-2 rounded border border-cyan/40 bg-panel p-2">
              <p className="text-xs font-semibold">Borrador para revisión</p>
              <p className="whitespace-pre-wrap text-xs">{String(proposal.value)}</p>
              {proposal.uncertainties.length > 0 && <p className="text-xs text-muted">Incertidumbre: {proposal.uncertainties.join("; ")}</p>}
              <button
                type="button"
                className="rounded border border-line-strong px-3 py-1.5 text-xs font-semibold"
                onClick={() => { props.onApply(proposal.value === null ? "" : String(proposal.value)); setOpen(false); }}
              >
                Aplicar al campo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
