"use client";

import { useActionState, useState } from "react";
import { signInAction, signUpAction, type AuthState } from "@/app/actions";
import { Button, Field, Notice, cx, inputClass } from "@/shared/ui/primitives";

type Mode = "signin" | "signup";

export function AuthForm({ initialMode, next, linkError }: { initialMode: Mode; next?: string; linkError?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [signInState, signIn, signingIn] = useActionState<AuthState, FormData>(signInAction, undefined);
  const [signUpState, signUp, signingUp] = useActionState<AuthState, FormData>(signUpAction, undefined);
  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;

  return (
    <div className="mt-8 rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div role="tablist" aria-label="Cuenta" className="grid grid-cols-2 gap-1 rounded-full border border-line p-1">
        {(
          [
            ["signin", "Entrar"],
            ["signup", "Crear cuenta"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cx(
              "rounded-full py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
              mode === m ? "bg-highlight text-black" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form action={mode === "signin" ? signIn : signUp} className="mt-5 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        {mode === "signup" && (
          <Field id="auth-name" label="Tu nombre">
            <input id="auth-name" name="name" defaultValue={state?.name} required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
          </Field>
        )}
        <Field id="auth-email" label="Correo">
          <input id="auth-email" name="email" defaultValue={state?.email} type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field id="auth-password" label="Contraseña" hint={mode === "signup" ? "Al menos 8 caracteres." : undefined}>
          <input
            id="auth-password"
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : 1}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={inputClass}
          />
        </Field>
        {linkError && !state && <Notice tone="warn">{linkError}</Notice>}
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {state?.notice && <Notice tone="success">{state.notice}</Notice>}
        <Button variant="primary" type="submit" disabled={pending} className="w-full">
          {pending ? "Un momento…" : mode === "signin" ? "Entrar" : "Crear mi cuenta"}
        </Button>
      </form>
    </div>
  );
}
