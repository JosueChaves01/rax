"use client";

import { useState, type ReactNode } from "react";
import { completeOnboardingAction } from "@/app/actions";
import { EXPERIENCE_LABEL, EXPERTISE_LABEL, GOAL_LABEL, NATURE_LABEL, WEEKLY_HOURS_LABEL } from "@/features/labels";
import type { EntrepreneurGoal, ExperienceBand, Expertise, InitiativeNature, WeeklyHours } from "@/types/domain";
import { Button, Field, Notice, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

type Mode = "choose" | "entrepreneur" | "mentor" | "admin";

/**
 * Bienvenida por tipo de usuario. Lo que la persona cuenta acá le sirve a la administración para
 * asignar mentores y al mentor para entender qué espera cada emprendedor.
 */
export function OnboardingForm({ mode: initial, defaultName, reapply = false }: { mode: Mode; defaultName: string; reapply?: boolean }) {
  const [mode, setMode] = useState<Mode>(initial);
  if (mode === "choose") return <Choose onPick={setMode} />;
  if (mode === "entrepreneur") return <EntrepreneurFlow defaultName={defaultName} onBack={initial === "choose" ? () => setMode("choose") : undefined} />;
  if (mode === "mentor") return <MentorFlow defaultName={defaultName} alreadyMentor={initial === "mentor" && !reapply} onBack={initial === "choose" ? () => setMode("choose") : undefined} />;
  return <AdminFlow defaultName={defaultName} />;
}

function Title({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <header className="mt-10">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-3 text-[clamp(2.5rem,9vw,4.25rem)]">{children}</h1>
    </header>
  );
}

function Choose({ onPick }: { onPick: (m: Mode) => void }) {
  const options: Array<{ mode: Mode; title: string; body: string }> = [
    { mode: "entrepreneur", title: "Tengo un emprendimiento", body: "Una idea, algo que estás armando o un negocio que ya funciona. RAX te ayuda a ordenarlo y a decidir qué probar primero." },
    { mode: "mentor", title: "Quiero acompañar como mentor/a", body: "Revisás diagnósticos, priorizás problemas y aprobás hipótesis. La administración valida tu perfil antes de asignarte proyectos." },
  ];
  return (
    <>
      <Title eyebrow="Bienvenida · 1 de 3">
        ¿Cómo vas a <span className="text-highlight">usar RAX?</span>
      </Title>
      <ul className="mt-8 grid gap-3">
        {options.map((o) => (
          <li key={o.mode}>
            <button
              type="button"
              onClick={() => onPick(o.mode)}
              className="group block w-full rounded-2xl border border-line bg-panel p-5 text-left transition-colors hover:border-accent/60 focus-visible:border-highlight"
            >
              <span className="display block text-3xl group-hover:text-highlight">{o.title}</span>
              <span className="mt-2 block text-sm text-muted">{o.body}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Steps({ step, total }: { step: number; total: number }) {
  return (
    <ol className="mt-6 flex gap-2" aria-label={`Paso ${step} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <li key={i} className={cx("h-1 flex-1 rounded-full", i < step ? "bg-highlight" : "bg-line")} />
      ))}
    </ol>
  );
}

function Chips<T extends string>({ options, value, onChange, label }: { options: Record<T, string>; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.entries(options) as Array<[T, string]>).map(([k, text]) => {
          const on = value.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== k) : [...value, k])}
              className={cx(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                on ? "border-highlight bg-highlight/15 text-ink" : "border-line text-muted hover:border-ink/40 hover:text-ink",
              )}
            >
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Nav({ onBack, next, pending, error }: { onBack?: () => void; next: ReactNode; pending?: boolean; error?: string | null }) {
  return (
    <>
      {error && (
        <div className="mt-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="mt-6 flex items-center justify-between gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
            Atrás
          </Button>
        ) : (
          <span />
        )}
        {next}
      </div>
    </>
  );
}

function EntrepreneurFlow({ defaultName, onBack }: { defaultName: string; onBack?: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(defaultName);
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState<InitiativeNature>("exploring_idea");
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours>("2to5");
  const [goals, setGoals] = useState<EntrepreneurGoal[]>([]);
  const [mentorExpectation, setMentorExpectation] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const { run, pending, error } = useAction();
  const [local, setLocal] = useState<string | null>(null);

  const submit = () =>
    run(() =>
      completeOnboardingAction({
        intent: "entrepreneur",
        name,
        profile: { intent: "entrepreneur", sector, stage, goals, weeklyHours, mentorExpectation },
        firstProject: { name: projectName, description, nature: stage },
      }),
    );

  return (
    <>
      <Title eyebrow={`Emprendimiento · paso ${step} de 3`}>
        {step === 1 && (
          <>
            Contanos <span className="text-highlight">de vos.</span>
          </>
        )}
        {step === 2 && (
          <>
            ¿Qué esperás <span className="text-highlight">de RAX?</span>
          </>
        )}
        {step === 3 && (
          <>
            Tu primer <span className="text-highlight">proyecto.</span>
          </>
        )}
      </Title>
      <Steps step={step} total={3} />
      <div className="mt-8 space-y-5">
        {step === 1 && (
          <>
            <Field id="ob-name" label="¿Cómo te llamás?">
              <input id="ob-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
            </Field>
            <Field id="ob-sector" label="¿De qué rubro es?" hint="Con tus palabras: comida, educación, servicios para empresas…">
              <input id="ob-sector" className={inputClass} value={sector} onChange={(e) => setSector(e.target.value)} maxLength={120} />
            </Field>
            <Field id="ob-stage" label="¿En qué punto estás?">
              <select id="ob-stage" className={inputClass} value={stage} onChange={(e) => setStage(e.target.value as InitiativeNature)}>
                {Object.entries(NATURE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="ob-hours" label="¿Cuánto tiempo por semana le podés dedicar?">
              <select id="ob-hours" className={inputClass} value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value as WeeklyHours)}>
                {Object.entries(WEEKLY_HOURS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Chips label="Elegí lo que más te importa ahora (podés marcar varias)" options={GOAL_LABEL} value={goals} onChange={setGoals} />
            <Field id="ob-mentor" label="¿Qué te gustaría que haga un mentor por vos?" hint="Opcional. Le sirve a quien te acompañe para saber por dónde empezar.">
              <textarea id="ob-mentor" rows={3} className={inputClass} value={mentorExpectation} onChange={(e) => setMentorExpectation(e.target.value)} maxLength={600} />
            </Field>
          </>
        )}
        {step === 3 && (
          <>
            <p className="text-muted">Ponele un nombre provisional. Después RAX te va a hacer preguntas para ordenar lo que sabés y lo que todavía no.</p>
            <Field id="ob-pname" label="Nombre provisional del proyecto">
              <input id="ob-pname" className={inputClass} value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={80} placeholder="Ej.: Almuerzos para oficinas" />
            </Field>
            <Field id="ob-pdesc" label="En una frase (opcional)">
              <textarea id="ob-pdesc" rows={2} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
            </Field>
          </>
        )}
      </div>
      <Nav
        onBack={step > 1 ? () => setStep(step - 1) : onBack}
        pending={pending}
        error={local ?? error}
        next={
          step < 3 ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setLocal(null);
                if (step === 1 && name.trim().length < 2) return setLocal("Contanos cómo te llamás.");
                if (step === 2 && !goals.length) return setLocal("Elegí al menos una opción.");
                setStep(step + 1);
              }}
            >
              Seguir
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => {
                setLocal(null);
                if (projectName.trim().length < 2) return setLocal("Poné al menos un nombre provisional.");
                submit();
              }}
            >
              {pending ? "Preparando…" : "Empezar la conversación"}
            </Button>
          )
        }
      />
    </>
  );
}

function MentorFlow({ defaultName, alreadyMentor, onBack }: { defaultName: string; alreadyMentor: boolean; onBack?: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(defaultName);
  const [yearsExperience, setYears] = useState<ExperienceBand>("3to7");
  const [bio, setBio] = useState("");
  const [linkedinUrl, setLinkedin] = useState("");
  const [expertise, setExpertise] = useState<Expertise[]>([]);
  const [sectors, setSectors] = useState("");
  const [monthlyHours, setMonthlyHours] = useState(4);
  const [maxProjects, setMaxProjects] = useState(2);
  const { run, pending, error } = useAction();
  const [local, setLocal] = useState<string | null>(null);

  const submit = () =>
    run(() =>
      completeOnboardingAction({
        intent: "mentor",
        name,
        profile: { intent: "mentor", expertise, sectors, yearsExperience, monthlyHours, maxProjects, bio, ...(linkedinUrl.trim() ? { linkedinUrl: linkedinUrl.trim() } : {}) },
      }),
    );

  return (
    <>
      <Title eyebrow={`Mentoría · paso ${step} de 2`}>
        {step === 1 ? (
          <>
            Tu <span className="text-highlight">experiencia.</span>
          </>
        ) : (
          <>
            Cómo podés <span className="text-highlight">ayudar.</span>
          </>
        )}
      </Title>
      <Steps step={step} total={2} />
      {!alreadyMentor && step === 1 && (
        <div className="mt-6">
          <Notice>La administración revisa cada solicitud antes de asignar proyectos. Te avisamos en RAX cuando esté aprobada.</Notice>
        </div>
      )}
      <div className="mt-8 space-y-5">
        {step === 1 && (
          <>
            <Field id="mo-name" label="¿Cómo te llamás?">
              <input id="mo-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
            </Field>
            <Field id="mo-years" label="Años de experiencia emprendiendo o acompañando">
              <select id="mo-years" className={inputClass} value={yearsExperience} onChange={(e) => setYears(e.target.value as ExperienceBand)}>
                {Object.entries(EXPERIENCE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="mo-bio" label="Contanos tu recorrido" hint="Qué hiciste, en qué tipo de negocios. Lo leen la administración y las personas que acompañes.">
              <textarea id="mo-bio" rows={4} className={inputClass} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1200} />
            </Field>
            <Field id="mo-link" label="Perfil de LinkedIn (opcional)">
              <input id="mo-link" type="url" inputMode="url" className={inputClass} value={linkedinUrl} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://www.linkedin.com/in/…" />
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Chips label="Áreas en las que podés acompañar" options={EXPERTISE_LABEL} value={expertise} onChange={setExpertise} />
            <Field id="mo-sectors" label="Rubros que conocés bien">
              <input id="mo-sectors" className={inputClass} value={sectors} onChange={(e) => setSectors(e.target.value)} maxLength={300} placeholder="Ej.: alimentos, comercio, servicios" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="mo-hours" label="Horas por mes disponibles">
                <input id="mo-hours" type="number" min={1} max={80} className={inputClass} value={monthlyHours} onChange={(e) => setMonthlyHours(Number(e.target.value))} />
              </Field>
              <Field id="mo-max" label="Proyectos a la vez, como máximo">
                <input id="mo-max" type="number" min={1} max={10} className={inputClass} value={maxProjects} onChange={(e) => setMaxProjects(Number(e.target.value))} />
              </Field>
            </div>
          </>
        )}
      </div>
      <Nav
        onBack={step > 1 ? () => setStep(1) : onBack}
        pending={pending}
        error={local ?? error}
        next={
          step === 1 ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setLocal(null);
                if (name.trim().length < 2) return setLocal("Contanos cómo te llamás.");
                if (bio.trim().length < 30) return setLocal("Contanos un poco más de tu recorrido (al menos 30 caracteres).");
                if (linkedinUrl.trim() && !/^https:\/\//.test(linkedinUrl.trim())) return setLocal("El enlace tiene que empezar con https://");
                setStep(2);
              }}
            >
              Seguir
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => {
                setLocal(null);
                if (!expertise.length) return setLocal("Elegí al menos un área.");
                submit();
              }}
            >
              {pending ? "Enviando…" : alreadyMentor ? "Guardar y entrar" : "Enviar solicitud"}
            </Button>
          )
        }
      />
    </>
  );
}

function AdminFlow({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [organization, setOrganization] = useState("");
  const [program, setProgram] = useState("");
  const { run, pending, error } = useAction();
  return (
    <>
      <Title eyebrow="Administración">
        Tu <span className="text-highlight">programa.</span>
      </Title>
      <div className="mt-6">
        <Notice>
          Como administración gestionás personas, solicitudes de mentoría y asignaciones. No ves el contenido de los proyectos: solo nombre, dueño y
          estado.
        </Notice>
      </div>
      <div className="mt-8 space-y-5">
        <Field id="ad-name" label="Tu nombre">
          <input id="ad-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field id="ad-org" label="Organización">
          <input id="ad-org" className={inputClass} value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={160} placeholder="Ej.: incubadora, universidad, fondo" />
        </Field>
        <Field id="ad-prog" label="¿Qué programa acompañan con RAX?" hint="Cohorte, convocatoria o programa: a quién está dirigido y cuánto dura.">
          <textarea id="ad-prog" rows={3} className={inputClass} value={program} onChange={(e) => setProgram(e.target.value)} maxLength={600} />
        </Field>
      </div>
      <Nav
        pending={pending}
        error={error}
        next={
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            onClick={() => run(() => completeOnboardingAction({ intent: "admin", name, profile: { intent: "admin", organization, program } }))}
          >
            {pending ? "Guardando…" : "Entrar al panel"}
          </Button>
        }
      />
    </>
  );
}
