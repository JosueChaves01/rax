"use client";

import { useEffect, useRef, useState } from "react";
import type { IntakeCoverage, IntakeStatus } from "@/types/b2b";
import type { IntakeView, IntakeViewMessage } from "@/lib/services/intake";
import { intakeTurnAction, submitIntakeAction } from "@/app/actions/client";
import { Button, Card, Notice, Tag, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

type GuideRow = IntakeView["guide"][number];

const COVERAGE_STYLE: Record<IntakeCoverage | "pending", { cls: string; label: string }> = {
  answered: { cls: "bg-emerald-500", label: "Respondida" },
  partial: { cls: "bg-amber-400", label: "A medias" },
  skipped: { cls: "bg-slate-400", label: "Saltada" },
  pending: { cls: "bg-slate-200", label: "Pendiente" },
};

/** Cobertura de la guía agrupada por tema, en el orden de la guía. */
function byTopic(guide: GuideRow[]): Array<{ topic: string; questions: GuideRow[] }> {
  const out: Array<{ topic: string; questions: GuideRow[] }> = [];
  for (const q of guide) {
    const group = out.find((g) => g.topic === q.topic);
    if (group) group.questions.push(q);
    else out.push({ topic: q.topic, questions: [q] });
  }
  return out;
}

function CoverageBar({ guide, coverage }: { guide: GuideRow[]; coverage: Record<string, IntakeCoverage> }) {
  const done = guide.filter((q) => coverage[q.id] === "answered" || coverage[q.id] === "skipped").length;
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Tu avance</h2>
        <span className="font-mono text-xs text-slate-500">
          {done} / {guide.length}
        </span>
      </div>
      <ul className="space-y-3">
        {byTopic(guide).map(({ topic, questions }) => (
          <li key={topic} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
              <span className="truncate">{topic}</span>
              {questions.some((q) => q.required && !coverage[q.id]) && <Tag color="var(--color-cyan)">obligatorio</Tag>}
            </div>
            <div className="flex gap-1" aria-label={`Avance en ${topic}`}>
              {questions.map((q) => {
                const s = COVERAGE_STYLE[coverage[q.id] ?? "pending"];
                return <span key={q.id} title={`${q.question} · ${s.label}`} className={cx("h-1.5 flex-1 rounded-full", s.cls)} />;
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-slate-500">
        {(["answered", "partial", "skipped", "pending"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={cx("h-2 w-2 rounded-full", COVERAGE_STYLE[k].cls)} aria-hidden />
            {COVERAGE_STYLE[k].label}
          </span>
        ))}
      </p>
    </Card>
  );
}

export function IntakeChat({
  projectId,
  mentorName,
  guide,
  initialMessages,
  initialCoverage,
  initialStatus,
  simulated,
}: {
  projectId: string;
  mentorName: string;
  guide: GuideRow[];
  initialMessages: IntakeViewMessage[];
  initialCoverage: Record<string, IntakeCoverage>;
  initialStatus: IntakeStatus;
  simulated: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState("");
  const [finished, setFinished] = useState(false);
  const turn = useAction();
  const submit = useAction();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length]);

  const closed = status === "submitted" || status === "reviewed";
  const hasAnswers = messages.some((m) => m.role === "client");
  const pendingRequired = guide.filter((q) => q.required && coverage[q.id] !== "answered" && coverage[q.id] !== "skipped");

  function send(value: string) {
    const content = value.trim();
    if ((!content && messages.length) || turn.pending || closed) return;
    const at = new Date().toISOString();
    const local: IntakeViewMessage | null = content ? { id: `local_${at}`, role: "client", content, simulated: false, createdAt: at } : null;
    if (local) setMessages((m) => [...m, local]);
    setText("");
    turn.run(
      () => intakeTurnAction(projectId, content),
      (r) => {
        if (!r.ok || !r.data) return;
        const data = r.data;
        setCoverage(data.state.coverage);
        setStatus(data.state.status);
        setFinished(data.finished);
        setMessages((m) => [...m, { id: `reply_${Date.now()}`, role: "interviewer", content: data.reply, simulated: data.provider === "simulated", createdAt: new Date().toISOString() }]);
      },
    );
  }

  function sendToMentor() {
    if (pendingRequired.length && !window.confirm(`Todavía faltan ${pendingRequired.length} pregunta(s) obligatoria(s). ¿Quieres enviarla igual? Lo que falte lo completan en la Sesión 1.`)) return;
    submit.run(
      () => submitIntakeAction(projectId),
      (r) => {
        if (r.ok && r.data) setStatus(r.data.status);
      },
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="flex min-h-[60vh] flex-col overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Antes de tu primera sesión</p>
          <h1 className="display mt-1 text-2xl text-slate-900">Conversa con el asistente de {mentorName}</h1>
          <p className="mt-1 text-sm text-slate-600">Te hace preguntas cortas, de a una. Lo que cuentes le llega a {mentorName} como un resumen para preparar la Sesión 1.</p>
          {simulated && (
            <p className="mt-2">
              <Tag color="var(--color-brand-orange)">Modo simulado: sin IA real</Tag>
            </p>
          )}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
          {messages.length === 0 && !turn.pending && (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p>Son unas pocas preguntas sobre ti y tu proyecto. Puedes responder con tus palabras, y si algo no lo sabes, di «no sé» y seguimos.</p>
              <Button variant="primary" onClick={() => send("")}>
                Empezar
              </Button>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cx("flex", m.role === "client" ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "client" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-800",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {turn.pending && (
            <p role="status" className="text-xs text-blue-700">
              El asistente está escribiendo…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <div className="space-y-3 border-t border-slate-200 px-5 py-4">
          {turn.error && <Notice tone="error">{turn.error}</Notice>}
          {submit.error && <Notice tone="error">{submit.error}</Notice>}
          {closed ? (
            <Notice tone="success">Listo. {mentorName} ya tiene tu resumen para preparar la Sesión 1. Si recuerdas algo más, cuéntaselo en la sesión.</Notice>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="intake-composer" className="sr-only">
                Tu respuesta
              </label>
              <textarea
                id="intake-composer"
                rows={2}
                maxLength={4000}
                value={text}
                disabled={!messages.length || submit.pending}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                placeholder="Escribe tu respuesta. Enter envía, Shift+Enter hace un salto de línea."
                className={`${inputClass} resize-y`}
              />
              <Button variant="secondary" type="submit" disabled={turn.pending || !text.trim() || !messages.length}>
                Responder
              </Button>
            </form>
          )}
        </div>
      </Card>

      <aside className="space-y-4">
        <CoverageBar guide={guide} coverage={coverage} />
        {!closed && (
          <Card className="space-y-3 p-5">
            <p className="text-sm text-slate-700">
              {pendingRequired.length
                ? `Faltan ${pendingRequired.length} pregunta(s) obligatoria(s).`
                : finished
                  ? "Ya cubriste lo importante."
                  : "Ya cubriste las preguntas obligatorias."}{" "}
              Cuando quieras, envía tu entrevista: tu mentor recibe un resumen de lo que conversaron.
            </p>
            <Button variant="primary" className="w-full" disabled={!hasAnswers || submit.pending || turn.pending} onClick={sendToMentor}>
              {submit.pending ? "Enviando…" : "Enviar a mi mentor"}
            </Button>
          </Card>
        )}
      </aside>
    </div>
  );
}
