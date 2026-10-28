"use client";

import { useActionState, useState } from "react";
import { googleSignInAction, signInAction, signUpAction, type AuthState } from "@/app/actions";
import { Button, Field, Notice, cx, inputClass } from "@/shared/ui/primitives";

type Mode = "signin" | "signup";

export function AuthForm({ initialMode, next, linkError }: { initialMode: Mode; next?: string; linkError?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [signInState, signIn, signingIn] = useActionState<AuthState, FormData>(signInAction, undefined);
  const [signUpState, signUp, signingUp] = useActionState<AuthState, FormData>(signUpAction, undefined);
  const [googleState, google, goingToGoogle] = useActionState<AuthState, FormData>(googleSignInAction, undefined);
  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp || goingToGoogle;

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

      <form action={google} className="mt-5">
        {next && <input type="hidden" name="next" value={next} />}
        <Button type="submit" disabled={pending} className="w-full">
          <GoogleMark />
          {goingToGoogle ? "Abriendo Google…" : mode === "signin" ? "Entrar con Google" : "Registrarme con Google"}
        </Button>
        {googleState?.error && (
          <div className="mt-3">
            <Notice tone="error">{googleState.error}</Notice>
          </div>
        )}
      </form>

      <div className="mt-5 flex items-center gap-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />o con tu correo<span className="h-px flex-1 bg-line" />
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9h-4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}
