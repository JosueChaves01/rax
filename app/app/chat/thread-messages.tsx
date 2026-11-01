"use client";

import { cx } from "@/shared/ui/primitives";
import { PROPOSAL_TYPE_LABEL } from "@/lib/ai/step-actions";
import type { AgentArtifact, KnowledgeCitation } from "@/types/domain";
import { FormattedText } from "./formatted-text";

export interface MessageView {
  id: string;
  sender: "user" | "ai";
  senderName: string;
  text: string;
  time: string;
  chips?: string[];
  artifacts?: AgentArtifact[];
  citations?: KnowledgeCitation[];
  proposals?: Array<Record<string, unknown>>;
  cachedPromptUsed?: boolean;
  cacheStatus?: string;
  cachedTokens?: number;
}

/** Mensajes de un hilo: burbujas, artefactos, fuentes y tarjetas de propuestas. */
export function ThreadMessages({
  messages,
  appliedProposals,
  applyingProposalTitle,
  onApplyProposal,
  onOpenArtifact,
  onSaveToKnowledge,
}: {
  messages: MessageView[];
  appliedProposals: Set<string>;
  applyingProposalTitle: string | null;
  onApplyProposal: (proposal: Record<string, unknown>) => void;
  onOpenArtifact: (artifact: AgentArtifact) => void;
  onSaveToKnowledge: (message: MessageView) => void;
}) {
  return (
    <>
      {messages.map((m) => (
              <div
                key={m.id}
                className={cx("flex flex-col group", m.sender === "user" ? "items-end" : "items-start")}
              >
                <div className="flex flex-wrap items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 font-mono">
                  <span>{m.senderName}</span>
                  <span>•</span>
                  <span>{m.time}</span>
                  {m.cacheStatus === "hit" && (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded font-sans font-semibold inline-flex items-center gap-1">
                      ⚡ Prompt Cache Hit ({m.cachedTokens ? `${m.cachedTokens.toLocaleString()} tokens` : "activo"})
                    </span>
                  )}
                  {m.cacheStatus === "write" && (
                    <span className="text-blue-700 bg-blue-50 border border-blue-200/80 px-1.5 py-0.5 rounded font-sans font-semibold inline-flex items-center gap-1">
                      💾 Prompt Cache Escrito
                    </span>
                  )}
                  {m.cacheStatus === "unavailable" && (
                    <span className="text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded font-sans font-semibold inline-flex items-center gap-1">
                      IA no disponible
                    </span>
                  )}
                  {m.cacheStatus === "simulated" && (
                    <span className="text-slate-500 bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 rounded font-sans font-medium inline-flex items-center gap-1">
                      🧪 Simulado
                    </span>
                  )}
                </div>

                <div
                  className={cx(
                    "max-w-[92%] @lg:max-w-[80%] p-3 @lg:p-4 rounded-2xl text-xs leading-relaxed",
                    m.sender === "user"
                      ? "bg-slate-900 text-white rounded-br-xs shadow-xs"
                      : "bg-white text-slate-900 border border-slate-200/80 shadow-2xs rounded-bl-xs",
                  )}
                >
                  <FormattedText content={m.text} isUser={m.sender === "user"} />

                  {/* Tarjetas de Artefactos generados */}
                  {m.artifacts && m.artifacts.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <div className="text-[0.6875rem] font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1">
                        <span>Artefacto generado:</span>
                      </div>
                      {m.artifacts.map((art) => (
                        <div
                          key={art.id}
                          onClick={() => onOpenArtifact(art)}
                          className="p-3 bg-orange-50/50 hover:bg-orange-100/60 border border-orange-200/80 rounded-xl flex items-center justify-between cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="p-1.5 rounded-lg bg-orange-500 text-white">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-xs truncate">{art.title}</p>
                              <p className="text-[0.625rem] text-slate-500 font-mono">{art.identifier} · {art.type.split(".").pop()}</p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-orange-600 shrink-0">
                            <span className="hidden @lg:inline">Abrir en Panel </span>
                            <span className="@lg:hidden">Abrir </span>→
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Citas de Fuentes Consultadas en Conocimiento */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-2 flex flex-wrap items-center gap-1 text-[0.6875rem] text-slate-500">
                      <span className="font-semibold text-slate-700">Fuentes consultadas:</span>
                      {m.citations.map((c, idx) => (
                        <span
                          key={idx}
                          title={c.snippet}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[0.625rem] border border-slate-200"
                        >
                          📄 {c.filename}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Acciones propuestas para el proyecto (Workflows RAX-00..RAX-15) */}
                  {m.proposals && m.proposals.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <div className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <span>⚡ Acciones propuestas para el proyecto:</span>
                      </div>
                      {m.proposals.map((prop, idx) => {
                        const title = typeof prop.title === "string" ? prop.title : `Propuesta ${idx + 1}`;
                        const desc = typeof prop.description === "string" ? prop.description : undefined;
                        const rawType = typeof prop.type === "string" ? prop.type : "acción";
                        const isApplied = appliedProposals.has(title);
                        const isApplying = applyingProposalTitle === title;

                        return (
                          <div
                            key={idx}
                            className="p-3 bg-slate-50/80 border border-slate-200/90 rounded-xl flex flex-col @lg:flex-row items-stretch @lg:items-center justify-between gap-2 @lg:gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[0.625rem] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-orange-100 text-orange-800">
                                  {PROPOSAL_TYPE_LABEL[rawType] ?? rawType.replace("_", " ")}
                                </span>
                                <span className="font-semibold text-slate-800 truncate">{title}</span>
                              </div>
                              {desc && <p className="text-[0.6875rem] text-slate-500 mt-1 leading-snug">{desc}</p>}
                            </div>

                            <button
                              onClick={() => onApplyProposal(prop)}
                              disabled={isApplied || isApplying}
                              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${isApplied
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                                : "bg-orange-600 hover:bg-orange-700 text-white shadow-2xs cursor-pointer"
                                }`}
                            >
                              {isApplied ? "✓ Aplicado" : isApplying ? "Aplicando..." : "Aplicar al Proyecto"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Acción: Guardar en el conocimiento del proyecto */}
                {m.sender === "ai" && (
                  <div className="mt-1 flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition px-1">
                    <button
                      onClick={() => onSaveToKnowledge(m)}
                      className="text-[0.6875rem] font-medium text-slate-400 hover:text-orange-600 flex items-center gap-1 transition"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Guardar en Conocimiento del Proyecto
                    </button>
                  </div>
                )}
              </div>
            ))}
    </>
  );
}
