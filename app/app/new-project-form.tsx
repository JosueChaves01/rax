"use client";

import { useState } from "react";
import { createProjectAction } from "@/app/actions";
import { NATURE_LABEL } from "@/features/labels";
import type { InitiativeNature } from "@/types/domain";
import { Button, Field, Notice, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

export function NewProjectForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nature, setNature] = useState<InitiativeNature>("unknown");
  const { run, pending, error } = useAction();

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createProjectAction({ name, description, nature }));
      }}
    >
      <Field id="np-name" label="Nombre provisional" error={error ?? undefined}>
        <input id="np-name" required minLength={2} maxLength={80} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} aria-describedby={error ? "np-name-error" : undefined} placeholder="Ej.: Almuerzos para oficinas" />
      </Field>
      <Field id="np-desc" label="En una frase (opcional)">
        <textarea id="np-desc" rows={2} maxLength={1000} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field id="np-nature" label="¿En qué punto estás?">
        <select id="np-nature" className={inputClass} value={nature} onChange={(e) => setNature(e.target.value as InitiativeNature)}>
          {Object.entries(NATURE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="primary" type="submit" disabled={pending} className="w-full">
        {pending ? "Creando…" : "Crear y empezar a conversar"}
      </Button>
    </form>
  );
}
