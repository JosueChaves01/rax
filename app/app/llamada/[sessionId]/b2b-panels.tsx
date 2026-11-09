"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AgreementFrequency, MentorshipAgreement, MentorshipGoal } from "@/types/domain";
import type { ProjectMode } from "@/types/b2b";
import type { RoomCommitment, RoomPerson } from "@/lib/services/session-room";
import {
  addClientCommitmentAction,
  addKickoffGoalAction,
  confirmKickoffAgreementAction,
  getSessionRoomStateAction,
  saveKickoffAgreementAction,
  saveLiveNotesAction,
} from "@/app/actions/mentor";
import { AGREEMENT_FREQUENCY_LABEL, AGREEMENT_STATUS_LABEL } from "@/features/labels";
import { Button, Notice, cx, inputClass } from "@/shared/ui/primitives";

/**
 * Paneles de la sala en el flujo B2B (Fase 3): notas en vivo del mentor (autosave), el acuerdo de
 * la Sesión 1 con objetivos y compromisos por persona, y el acuerdo confirmado en modo lectura.
 */

/* ───────────── Notas en vivo ───────────── */

const AUTOSAVE_MS = 3000;

/**
 * Lo escrito sobrevive a cerrar y abrir la ventana (la ventana desmonta el panel): se guarda en
 * memoria de la página por sesión, junto con la última marca de guardado conocida.
 */
const notesCache = new Map<string, { text: string; updatedAt?: string }>();

type SaveStatus = "saved" | "dirty" | "saving" | "conflict" | "error";

export function LiveNotesPanel({ sessionId, initialText, initialUpdatedAt, closed }: { sessionId: string; initialText: string; initialUpdatedAt?: string; closed: boolean }) {
  const seed = notesCache.get(sessionId) ?? { text: initialText, updatedAt: initialUpdatedAt };
  const [text, setText] = useState(seed.text);
  const [status, setStatus] = useState<SaveStatus>(notesCache.has(sessionId) && seed.text !== initialText ? "dirty" : "saved");
  const [message, setMessage] = useState<string | null>(null);
  const base = useRef<string | undefined>(seed.updatedAt);
  const latest = useRef(seed.text);
  const timer = useRef<number | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);

  const save = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (saving.current || !dirty.current) return;
    const value = latest.current;
    saving.current = true;
    dirty.current = false;
    setStatus("saving");
    const res = await saveLiveNotesAction(sessionId, value, base.current ?? "");
    saving.current = false;
    if (res.ok && res.data) {
      base.current = res.data.updatedAt;
      notesCache.set(sessionId, { text: latest.current, updatedAt: base.current });
      setMessage(null);
      if (latest.current !== value) {
        dirty.current = true;
        setStatus("dirty");
        timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
      } else setStatus("saved");
    } else if (!res.ok) {
      dirty.current = true;
      setStatus(res.code === "conflict" ? "conflict" : "error");
      setMessage(res.error);
    }
  }, [sessionId]);

  const onChange = (value: string) => {
    setText(value);
    latest.current = value;
    dirty.current = true;
    notesCache.set(sessionId, { text: value, updatedAt: base.current });
    if (status !== "conflict") setStatus("dirty");
    // Guarda cada ~3 s mientras se escribe (no espera a que se deje de escribir).
    if (!timer.current && status !== "conflict") timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
  };

  // Al cerrar la ventana o salir de la sala se guarda lo pendiente.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      if (dirty.current && !saving.current) void saveLiveNotesAction(sessionId, latest.current, base.current ?? "");
    },
    [sessionId],
  );

  /** Conflicto: trae lo guardado en otra pestaña (descarta lo de acá) o sobrescribe con lo de acá. */
  const resolve = async (keepMine: boolean) => {
    const res = await getSessionRoomStateAction(sessionId);
    if (!res.ok || !res.data?.liveNotes) {
      setMessage(!res.ok ? res.error : "No se pudieron leer las notas guardadas.");
      return;
    }
    base.current = res.data.liveNotes.updatedAt;
    if (keepMine) {
      dirty.current = true;
      setStatus("dirty");
      await save();
    } else {
      setText(res.data.liveNotes.text);
      latest.current = res.data.liveNotes.text;
      dirty.current = false;
      notesCache.set(sessionId, { text: latest.current, updatedAt: base.current });
      setStatus("saved");
      setMessage(null);
    }
  };

  const label =
    status === "saving" ? "Guardando…"
    : status === "dirty" ? "Sin guardar"
    : status === "conflict" ? "Conflicto"
    : status === "error" ? "No se guardó"
    : base.current ? "Guardado"
    : "Solo tú ves estas notas";

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-slate-500">Privadas: el cliente no las ve. Entran a la síntesis al cerrar.</p>
        <span className={cx("shrink-0 font-semibold", status === "conflict" || status === "error" ? "text-rose-600" : status === "saved" ? "text-emerald-700" : "text-slate-400")} aria-live="polite">
          {label}
        </span>
      </div>
      <textarea
        aria-label="Notas en vivo"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void save()}
        readOnly={closed}
        maxLength={50_000}
        rows={14}
        placeholder={"- Lo que dijo de sus ventas\n- Dudas para la próxima sesión\n- Ideas de compromisos"}
        className={cx(inputClass, "min-h-56 resize-y font-mono text-xs leading-relaxed")}
      />
      {status === "conflict" && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
          <p>{message ?? "Las notas cambiaron en otra pestaña o dispositivo."} ¿Con cuáles te quedas?</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void resolve(false)}>Cargar las guardadas</Button>
            <Button size="sm" variant="danger" onClick={() => void resolve(true)}>Sobrescribir con las mías</Button>
          </div>
        </div>
      )}
      {status === "error" && message && <p className="text-rose-600">{message}</p>}
    </div>
  );
}

/* ───────────── Acuerdo (lectura) ───────────── */

export function ConfirmedAgreementView({
  agreement,
  goals,
  commitments,
  mode,
}: {
  agreement?: MentorshipAgreement;
  goals: MentorshipGoal[];
  commitments: RoomCommitment[];
  mode: ProjectMode;
}) {
  if (!agreement) return <p className="text-xs text-slate-400">Todavía no hay un acuerdo confirmado. Lo verás aquí cuando tu mentor lo confirme.</p>;
  return (
    <div className="space-y-3 text-xs leading-relaxed text-slate-700">
      <Block label="Qué vamos a trabajar">{agreement.scope}</Block>
      {agreement.entrepreneurCommitments && <Block label={mode === "group" ? "Compromisos del grupo" : "Tus compromisos"}>{agreement.entrepreneurCommitments}</Block>}
      {agreement.mentorCommitments && <Block label="Compromisos del mentor">{agreement.mentorCommitments}</Block>}
      <p className="text-slate-500">
        Sesiones {AGREEMENT_FREQUENCY_LABEL[agreement.frequency].toLowerCase()} de {agreement.sessionDurationMinutes} min · {agreement.expectedDurationWeeks} semanas
      </p>
      {goals.length > 0 && (
        <div className="space-y-1">
          <Label>Objetivos</Label>
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-300">
            {goals.map((g) => (
              <li key={g.id}>
                <span className="font-semibold text-slate-900">{g.title}</span> · {g.targetResult}
              </li>
            ))}
          </ul>
        </div>
      )}
      <CommitmentList commitments={commitments} mode={mode} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">{children}</p>;
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function CommitmentList({ commitments, mode }: { commitments: RoomCommitment[]; mode: ProjectMode }) {
  if (!commitments.length) return null;
  return (
    <div className="space-y-1">
      <Label>{mode === "group" ? "Compromisos por persona" : "Compromisos"}</Label>
      <ul className="space-y-1">
        {commitments.map((c) => (
          <li key={c.id}>
            {mode === "group" && <span className="font-semibold text-slate-900">{c.assigneeName}: </span>}
            {c.title}
            {c.dueDate && <span className="text-slate-400"> · para {c.dueDate.slice(0, 10)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── Acuerdo de la Sesión 1 (mentor) ───────────── */

const FREQUENCIES: AgreementFrequency[] = ["weekly", "biweekly", "monthly", "on_demand"];

export function AgreementPanel({
  sessionId,
  mode,
  clients,
  agreement,
  goals,
  commitments,
  closed,
}: {
  sessionId: string;
  mode: ProjectMode;
  clients: RoomPerson[];
  agreement?: MentorshipAgreement;
  goals: MentorshipGoal[];
  commitments: RoomCommitment[];
  closed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    scope: agreement?.scope ?? "",
    clientCommitments: agreement?.entrepreneurCommitments ?? "",
    mentorCommitments: agreement?.mentorCommitments ?? "",
    frequency: agreement?.frequency ?? ("biweekly" as AgreementFrequency),
    sessionDurationMinutes: agreement?.sessionDurationMinutes ?? 60,
    expectedDurationWeeks: agreement?.expectedDurationWeeks ?? 12,
  });
  const [goal, setGoal] = useState({ title: "", targetResult: "" });
  const [commitment, setCommitment] = useState({ clientId: clients[0]?.id ?? "", title: "", dueDate: "" });
  const isActive = agreement?.status === "active";
  const group = mode === "group";

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "No se pudo guardar.");
      setNotice(done);
      after?.();
      router.refresh();
    });

  const saveAgreement = () => saveKickoffAgreementAction(sessionId, form);
  const confirm = () =>
    act(async () => {
      const saved = await saveAgreement();
      if (!saved.ok) return saved;
      return confirmKickoffAgreementAction(sessionId);
    }, "Acuerdo confirmado. La persona ya lo ve en la sala y en su proyecto.");

  if (closed) return <ConfirmedAgreementView agreement={isActive ? agreement : undefined} goals={goals} commitments={commitments} mode={mode} />;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 text-xs text-slate-700">
      {clients.length === 0 && <Notice tone="warn">Todavía nadie aceptó la invitación: el acuerdo se arma con al menos una persona en el proyecto.</Notice>}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>{group ? "Acuerdo del grupo" : "Acuerdo"}</Label>
          {agreement && <span className={cx("font-semibold", isActive ? "text-emerald-700" : "text-slate-500")}>{AGREEMENT_STATUS_LABEL[agreement.status]}</span>}
        </div>
        <textarea aria-label="Qué van a trabajar" className={cx(inputClass, "text-xs")} rows={3} value={form.scope} onChange={(e) => set("scope", e.target.value)} placeholder="Qué van a trabajar juntos y para qué" />
        <textarea
          aria-label={group ? "Compromisos del grupo" : "Compromisos de la persona"}
          className={cx(inputClass, "text-xs")}
          rows={2}
          value={form.clientCommitments}
          onChange={(e) => set("clientCommitments", e.target.value)}
          placeholder={group ? "A qué se compromete el grupo" : "A qué se compromete la persona"}
        />
        <textarea aria-label="Tus compromisos" className={cx(inputClass, "text-xs")} rows={2} value={form.mentorCommitments} onChange={(e) => set("mentorCommitments", e.target.value)} placeholder="A qué te comprometes tú" />
        <div className="grid grid-cols-3 gap-2">
          <select aria-label="Frecuencia" className={cx(inputClass, "text-xs")} value={form.frequency} onChange={(e) => set("frequency", e.target.value as AgreementFrequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {AGREEMENT_FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <input aria-label="Minutos por sesión" type="number" min={15} max={240} className={cx(inputClass, "text-xs")} value={form.sessionDurationMinutes} onChange={(e) => set("sessionDurationMinutes", Number(e.target.value))} />
            <span className="text-slate-400">min</span>
          </label>
          <label className="flex items-center gap-1">
            <input aria-label="Semanas" type="number" min={1} max={104} className={cx(inputClass, "text-xs")} value={form.expectedDurationWeeks} onChange={(e) => set("expectedDurationWeeks", Number(e.target.value))} />
            <span className="text-slate-400">sem</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => act(saveAgreement, "Borrador guardado.")}>
            Guardar borrador
          </Button>
          <Button size="sm" variant="primary" disabled={pending} onClick={confirm}>
            {isActive ? "Confirmar nueva versión" : "Confirmar acuerdo"}
          </Button>
        </div>
      </section>

      <section className="space-y-2 border-t border-slate-100 pt-3">
        <Label>Objetivos</Label>
        {goals.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 marker:text-slate-300">
            {goals.map((g) => (
              <li key={g.id}>
                <span className="font-semibold text-slate-900">{g.title}</span> · {g.targetResult}
              </li>
            ))}
          </ul>
        )}
        <input aria-label="Objetivo" className={cx(inputClass, "text-xs")} value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} placeholder="Objetivo (p. ej. ordenar la caja)" />
        <input aria-label="Resultado esperado" className={cx(inputClass, "text-xs")} value={goal.targetResult} onChange={(e) => setGoal({ ...goal, targetResult: e.target.value })} placeholder="Cómo sabrán que se logró" />
        <Button size="sm" disabled={pending || !goal.title.trim()} onClick={() => act(() => addKickoffGoalAction(sessionId, goal), "Objetivo agregado.", () => setGoal({ title: "", targetResult: "" }))}>
          Agregar objetivo
        </Button>
      </section>

      <section className="space-y-2 border-t border-slate-100 pt-3">
        <Label>{group ? "Compromisos por persona" : "Compromisos de la persona"}</Label>
        <CommitmentList commitments={commitments} mode={mode} />
        {group && (
          <select aria-label="Persona" className={cx(inputClass, "text-xs")} value={commitment.clientId} onChange={(e) => setCommitment({ ...commitment, clientId: e.target.value })}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <input aria-label="Compromiso" className={cx(inputClass, "text-xs")} value={commitment.title} onChange={(e) => setCommitment({ ...commitment, title: e.target.value })} placeholder="Qué va a hacer" />
          <input aria-label="Para cuándo" type="date" className={cx(inputClass, "w-36 text-xs")} value={commitment.dueDate} onChange={(e) => setCommitment({ ...commitment, dueDate: e.target.value })} />
        </div>
        <Button
          size="sm"
          disabled={pending || !commitment.title.trim() || clients.length === 0}
          onClick={() =>
            act(
              () => addClientCommitmentAction(sessionId, { clientId: commitment.clientId || undefined, title: commitment.title, dueDate: commitment.dueDate || undefined }),
              "Compromiso agregado como tarea.",
              () => setCommitment((c) => ({ ...c, title: "", dueDate: "" })),
            )
          }
        >
          Agregar compromiso
        </Button>
      </section>

      {error && <p className="text-rose-600" role="alert">{error}</p>}
      {notice && <p className="text-emerald-700" role="status">{notice}</p>}
    </div>
  );
}
