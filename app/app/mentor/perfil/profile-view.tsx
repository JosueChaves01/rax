"use client";

import { useRef, useState, useTransition } from "react";
import type { IntakeQuestion, MentorDocumentKind, MentorProfile } from "@/types/b2b";
import type { MentorDocumentSummary } from "@/lib/services/mentor-knowledge";
import {
  addMentorDocumentAction,
  deleteMentorDocumentAction,
  importMentorResourcesAction,
  listMentorDocumentsAction,
  saveMentorProfileAction,
} from "@/app/actions/mentor";
import { Button, Card, Empty, Field, Heading, Notice, Tag, formatDate, inputClass } from "@/shared/ui/primitives";

interface Props {
  initialProfile: MentorProfile;
  initialDocuments: MentorDocumentSummary[];
  ownResources: number;
}

type Flash = { tone: "success" | "error"; text: string } | null;
type DraftQuestion = IntakeQuestion & { key: string };

const KIND_LABEL: Record<MentorDocumentKind, string> = {
  methodology: "Metodología",
  template: "Plantilla",
  reference: "Referencia",
  example: "Ejemplo",
};

const TMP = "tmp_";
let tmpCounter = 0;
const newKey = () => `${TMP}${++tmpCounter}`;

export function MentorProfileView({ initialProfile, initialDocuments, ownResources }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="eyebrow">Tu forma de acompañar</p>
        <Heading level={1} highlight="de mentor." className="mt-2">
          Mi perfil
        </Heading>
        <p className="mt-1 text-sm text-muted">
          Lo que escribas aquí guía al asistente: la entrevista previa a la Sesión 1 usa tu guía y cita tu metodología y tus documentos.
        </p>
      </div>
      <ProfileCard initial={initialProfile} />
      <GuideCard initial={initialProfile.interviewGuide} />
      <KnowledgeCard initial={initialDocuments} ownResources={ownResources} />
    </div>
  );
}

/* ───────────── Perfil y metodología ───────────── */

function ProfileCard({ initial }: { initial: MentorProfile }) {
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [focus, setFocus] = useState(initial.focusAreas.join(", "));
  const [tone, setTone] = useState(initial.assistantTone);
  const [methodology, setMethodology] = useState(initial.methodology);
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    start(async () => {
      const res = await saveMentorProfileAction({
        headline,
        bio,
        methodology,
        assistantTone: tone,
        focusAreas: focus.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setFlash(res.ok ? { tone: "success", text: "Perfil guardado." } : { tone: "error", text: res.error });
    });
  };

  return (
    <Card className="p-6">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Presentación y metodología</h2>
        <Field label="Titular" id="mp-headline" hint="Una línea: a quién acompañas y en qué.">
          <input id="mp-headline" className={inputClass} maxLength={200} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </Field>
        <Field label="Biografía" id="mp-bio">
          <textarea id="mp-bio" className={inputClass} rows={4} maxLength={4000} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field label="Áreas de foco" id="mp-focus" hint="Separadas por comas, por ejemplo: finanzas, ventas, equipo.">
          <input id="mp-focus" className={inputClass} value={focus} onChange={(e) => setFocus(e.target.value)} />
        </Field>
        <Field label="Metodología" id="mp-method" hint="Cómo trabajas: pasos, principios, qué revisas primero. El asistente la sigue y la cita.">
          <textarea id="mp-method" className={inputClass} rows={8} maxLength={10000} value={methodology} onChange={(e) => setMethodology(e.target.value)} />
        </Field>
        <Field label="Tono del asistente" id="mp-tone" hint="Cómo quieres que hable el asistente con tus clientes.">
          <textarea id="mp-tone" className={inputClass} rows={2} maxLength={2000} value={tone} onChange={(e) => setTone(e.target.value)} />
        </Field>
        {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ───────────── Guía de entrevista ───────────── */

function GuideCard({ initial }: { initial: IntakeQuestion[] }) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => initial.map((q) => ({ ...q, key: q.id })));
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, start] = useTransition();

  const patch = (key: string, change: Partial<IntakeQuestion>) => setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...change } : q)));
  const move = (index: number, delta: number) =>
    setQuestions((qs) => {
      const target = index + delta;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const add = () => {
    const key = newKey();
    setQuestions((qs) => [...qs, { key, id: key, topic: "", question: "", why: "", required: false }]);
  };
  const remove = (key: string) => setQuestions((qs) => qs.filter((q) => q.key !== key));

  const save = () => {
    setFlash(null);
    start(async () => {
      const res = await saveMentorProfileAction({
        interviewGuide: questions.map((q) => ({
          id: q.id.startsWith(TMP) ? "" : q.id,
          topic: q.topic,
          question: q.question,
          why: q.why,
          required: q.required,
        })),
      });
      if (res.ok && res.data) {
        setQuestions(res.data.interviewGuide.map((q) => ({ ...q, key: q.id })));
        setFlash({ tone: "success", text: "Guía guardada." });
      } else if (!res.ok) {
        setFlash({ tone: "error", text: res.error });
      }
    });
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Guía de entrevista</h2>
          <p className="mt-1 text-sm text-muted">
            Las preguntas que el asistente le hace a cada cliente antes de la Sesión 1. Las obligatorias tienen que quedar cubiertas.
          </p>
        </div>
        <Button size="sm" onClick={add}>
          + Agregar pregunta
        </Button>
      </div>

      <ol className="mt-5 space-y-4">
        {questions.length === 0 && (
          <li>
            <Empty title="Sin preguntas todavía">Agrega las preguntas que siempre haces en tu primera conversación.</Empty>
          </li>
        )}
        {questions.map((q, i) => (
          <li key={q.key} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-faint">Pregunta {i + 1}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </Button>
                <Button size="sm" variant="ghost" aria-label="Bajar" disabled={i === questions.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(q.key)}>
                  Quitar
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr]">
              <Field label="Tema" id={`q-topic-${q.key}`}>
                <input id={`q-topic-${q.key}`} className={inputClass} maxLength={120} value={q.topic} onChange={(e) => patch(q.key, { topic: e.target.value })} />
              </Field>
              <Field label="Pregunta" id={`q-text-${q.key}`}>
                <input id={`q-text-${q.key}`} className={inputClass} maxLength={500} value={q.question} onChange={(e) => patch(q.key, { question: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Para qué te sirve" id={`q-why-${q.key}`} hint="Orienta al asistente para repreguntar si la respuesta queda corta.">
                <input id={`q-why-${q.key}`} className={inputClass} maxLength={500} value={q.why} onChange={(e) => patch(q.key, { why: e.target.value })} />
              </Field>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={q.required} onChange={(e) => patch(q.key, { required: e.target.checked })} />
              Obligatoria
            </label>
          </li>
        ))}
      </ol>

      {flash && (
        <div className="mt-4">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar guía"}
        </Button>
      </div>
    </Card>
  );
}

/* ───────────── Conocimiento del mentor ───────────── */

function KnowledgeCard({ initial, ownResources }: { initial: MentorDocumentSummary[]; ownResources: number }) {
  const [docs, setDocs] = useState(initial);
  const [title, setTitle] = useState("");
  const [filename, setFilename] = useState("");
  const [fileType, setFileType] = useState("markdown");
  const [kind, setKind] = useState<MentorDocumentKind>("methodology");
  const [content, setContent] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [reading, setReading] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setFilename("");
    setFileType("markdown");
    setContent("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFlash(null);
    setReading(true);
    try {
      const form = new FormData();
      form.append("archivo", file);
      const res = await fetch("/api/documentos/extraer", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        extracted?: { title: string; filename: string; content: string; fileType: string };
      };
      if (!res.ok || !body.extracted) {
        setFlash({ tone: "error", text: body.error ?? "No se pudo leer el archivo." });
        return;
      }
      setTitle((t) => t || body.extracted!.title);
      setFilename(body.extracted.filename);
      setFileType(body.extracted.fileType);
      setContent(body.extracted.content);
    } finally {
      setReading(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    const cleanTitle = title.trim();
    start(async () => {
      const res = await addMentorDocumentAction({
        title: cleanTitle,
        filename: filename.trim() || `${cleanTitle.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60) || "documento"}.md`,
        content,
        fileType,
        kind,
      });
      if (res.ok && res.data) {
        setDocs((ds) => [res.data!, ...ds]);
        reset();
        setFlash({ tone: "success", text: "Documento agregado a tu conocimiento." });
      } else if (!res.ok) {
        setFlash({ tone: "error", text: res.error });
      }
    });
  };

  const remove = (id: string) => {
    if (!window.confirm("¿Borrar este documento? El asistente dejará de usarlo.")) return;
    setFlash(null);
    start(async () => {
      const res = await deleteMentorDocumentAction(id);
      if (res.ok) setDocs((ds) => ds.filter((d) => d.id !== id));
      else setFlash({ tone: "error", text: res.error });
    });
  };

  const importResources = () => {
    setFlash(null);
    start(async () => {
      const res = await importMentorResourcesAction();
      if (!res.ok) return setFlash({ tone: "error", text: res.error });
      const { imported = 0, skipped = 0 } = res.data ?? {};
      const fresh = await listMentorDocumentsAction();
      if (fresh.ok && fresh.data) setDocs(fresh.data);
      setFlash({
        tone: "success",
        text: imported ? `Se copiaron ${imported} recursos${skipped ? ` (${skipped} ya estaban)` : ""}.` : "Tus recursos ya estaban en tu conocimiento.",
      });
    });
  };

  const totalTokens = docs.reduce((sum, d) => sum + d.tokenCount, 0);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Tu conocimiento</h2>
          <p className="mt-1 text-sm text-muted">
            Metodologías, plantillas y ejemplos que el asistente consulta. Tus clientes no ven estos documentos: solo lo que el asistente cita.
          </p>
        </div>
        {ownResources > 0 && (
          <Button size="sm" onClick={importResources} disabled={pending}>
            Traer mis recursos ({ownResources})
          </Button>
        )}
      </div>

      <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {docs.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Todavía no subiste documentos.</li>}
        {docs.map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{doc.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-faint">
                <Tag>{KIND_LABEL[doc.kind]}</Tag>
                <span className="font-mono">{doc.filename}</span>
                <span>~{doc.tokenCount.toLocaleString("es")} tokens</span>
                <span>{formatDate(doc.updatedAt)}</span>
              </p>
            </div>
            <Button size="sm" variant="danger" onClick={() => remove(doc.id)} disabled={pending}>
              Borrar
            </Button>
          </li>
        ))}
      </ul>
      {docs.length > 0 && <p className="mt-2 text-xs text-faint">Total: ~{totalTokens.toLocaleString("es")} tokens.</p>}

      <form onSubmit={add} className="mt-6 space-y-4 rounded-xl border border-dashed border-slate-300 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Agregar documento</h3>
        <Field label="Archivo (opcional)" id="md-file" hint="PDF, Word, Excel, CSV, Markdown o texto, hasta 10 MB. Revisa el texto antes de guardarlo.">
          <input
            id="md-file"
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.xlsx,.csv,.md,.markdown,.txt,.json"
            className="block text-sm"
            disabled={reading || pending}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Título" id="md-title">
            <input id="md-title" className={inputClass} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Tipo" id="md-kind">
            <select id="md-kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as MentorDocumentKind)}>
              {(Object.keys(KIND_LABEL) as MentorDocumentKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Contenido" id="md-content" hint="Pega texto o Markdown, o sube un archivo arriba.">
          <textarea id="md-content" className={inputClass} rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
        {reading && <Notice>Leyendo el archivo…</Notice>}
        {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={pending || reading || !title.trim() || !content.trim()}>
            {pending ? "Guardando…" : "Agregar documento"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
