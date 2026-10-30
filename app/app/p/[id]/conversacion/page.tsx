import Link from "next/link";
import { CATEGORY_LABEL, INFO_TYPE_LABEL } from "@/features/labels";
import { pendingReview } from "@/features/diagnosis/rules";
import { Empty, Notice, Tag, cx } from "@/shared/ui/primitives";
import { INFO_COLOR } from "@/shared/ui/domain-colors";
import { loadWorkspace } from "../data";
import { Composer } from "../composer";
import { getDeps } from "@/lib/runtime";
import { getAgentThread, listAgentMessages } from "@/lib/services/agent-chat";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  const deps = await getDeps();
  const agentThread = deps && (deps.actor.role === "entrepreneur" || deps.actor.role === "mentor") ? await getAgentThread(deps, id) : undefined;
  const agentMessages = deps && agentThread ? await listAgentMessages(deps, agentThread.id) : [];

  if (w.conversationHidden) {
    return (
      <Empty title="Conversación privada">
        El emprendedor no compartió la conversación completa. Trabajá con el resumen preparado y el diagnóstico, que contienen lo que confirmó.
      </Empty>
    );
  }
  const recent = pendingReview(w.items).slice(-6).reverse();
  const canWrite = w.permissions["conversation.write"];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="conv-title" className="flex min-h-[60vh] flex-col rounded-2xl border border-line bg-panel">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <h2 id="conv-title" className="display text-2xl">
            Conversación
          </h2>
          <Tag color="var(--color-highlight)" title="La conversación usa el hilo común, pero las capacidades de agente aún requieren una instancia n8n operativa.">
            Agente principal · no operativo
          </Tag>
          {!canWrite && <Tag>Solo lectura</Tag>}
        </header>
        <ol className="flex-1 space-y-4 px-5 py-6" aria-label="Mensajes">
          {[...w.messages.map((m) => ({ id: m.id, author: m.author === "entrepreneur" ? "user" as const : m.author === "assistant" ? "assistant" as const : "system" as const, content: m.content, provider: m.provider })),
            ...agentMessages.map((m) => ({ id: m.id, author: m.author, content: m.content, provider: undefined }))].map((m) => {
            const mine = m.author === "user";
            return (
              <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    mine ? "rounded-br-sm bg-raised" : m.author === "system" ? "border border-danger/40 bg-danger/10" : "rounded-bl-sm border border-line bg-bg",
                  )}
                >
                  <p className="mb-1 flex items-center gap-2 text-[0.6875rem] text-faint">
                    <span>{mine ? "Tú" : "RAX"}</span>
                    {m.provider === "simulated" && <span className="text-highlight">· simulación</span>}
                    {m.provider === "openrouter" && <span className="text-cyan">· modelo de IA</span>}
                  </p>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {canWrite ? (
          <Composer projectId={id} />
        ) : (
          <p className="border-t border-line px-5 py-4 text-sm text-muted">Como mentor podés leer la conversación porque el emprendedor la compartió. No podés escribir en ella.</p>
        )}
      </section>

      <aside aria-labelledby="entendio" className="space-y-3">
        <h2 id="entendio" className="eyebrow">Propuestas previas del diagnóstico · pendiente de revisión</h2>
        {recent.length === 0 ? (
          <Notice>No hay propuestas pendientes. La generación automática de diagnóstico estará disponible cuando RAX-04 se conecte al agente principal.</Notice>
        ) : (
          <ul className="space-y-2">
            {recent.map((i) => (
              <li key={i.id} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex flex-wrap gap-1.5">
                  <Tag color={INFO_COLOR[i.infoType]}>{INFO_TYPE_LABEL[i.infoType]}</Tag>
                </div>
                <p className="mt-2 text-sm font-semibold">{i.title}</p>
                <p className="line-clamp-2 text-xs text-muted">{i.content}</p>
                <p className="mt-1 text-[0.6875rem] text-faint">{CATEGORY_LABEL[i.category]}</p>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/app/p/${id}/diagnostico`} className="inline-block text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:text-accent-strong">
          Revisar en el diagnóstico →
        </Link>
      </aside>
    </div>
  );
}
