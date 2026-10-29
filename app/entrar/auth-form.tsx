"use client";

import { useActionState, useState } from "react";
import { googleSignInAction, signInAction, signUpAction, type AuthState } from "@/app/actions";
import { Notice, cx } from "@/shared/ui/primitives";

type Mode = "signin" | "signup";
type SelectedRole = "mentor" | "entrepreneur";

export function AuthForm({ initialMode, next, linkError }: { initialMode: Mode; next?: string; linkError?: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selectedRole, setSelectedRole] = useState<SelectedRole>("mentor");
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  const [signInState, signIn, signingIn] = useActionState<AuthState, FormData>(signInAction, undefined);
  const [signUpState, signUp, signingUp] = useActionState<AuthState, FormData>(signUpAction, undefined);
  const [googleState, google, goingToGoogle] = useActionState<AuthState, FormData>(googleSignInAction, undefined);

  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp || goingToGoogle;

  return (
    <div className="space-y-5">
      {/* Selector de Rol Segmentado (Panel 0 del Mock) */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => setSelectedRole("mentor")}
          className={cx(
            "py-2 text-xs font-semibold rounded-lg transition-all text-center",
            selectedRole === "mentor"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Mentor
        </button>
        <button
          type="button"
          onClick={() => setSelectedRole("entrepreneur")}
          className={cx(
            "py-2 text-xs font-semibold rounded-lg transition-all text-center",
            selectedRole === "entrepreneur"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          )}
        >
          Emprendedor
        </button>
      </div>

      {/* Formulario de Acceso por Correo */}
      <form action={mode === "signin" ? signIn : signUp} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <input type="hidden" name="rolePreference" value={selectedRole} />

        {mode === "signup" && (
          <div className="space-y-1">
            <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700">
              Nombre completo
            </label>
            <input
              id="auth-name"
              name="name"
              defaultValue={state?.name}
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              placeholder="Ej. Laura Morales"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700">
            Correo electrónico
          </label>
          <input
            id="auth-email"
            name="email"
            defaultValue={state?.email}
            type="email"
            required
            autoComplete="email"
            placeholder="tu@correo.com"
            className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700">
              Contraseña
            </label>
            {mode === "signin" && (
              <button
                type="button"
                onClick={() => setShowForgotNotice(true)}
                className="text-[11px] text-blue-600 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>
          <input
            id="auth-password"
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : 1}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="••••••••"
            className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>

        {showForgotNotice && (
          <div className="p-3 text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-xl">
            Ingresa tu correo y contacta al administrador de RAX para restablecer el acceso temporal.
          </div>
        )}

        {linkError && !state && <Notice tone="warn">{linkError}</Notice>}
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {state?.notice && <Notice tone="success">{state.notice}</Notice>}

        {/* Botón Principal "Iniciar sesión" */}
        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
        >
          {pending ? "Un momento…" : mode === "signin" ? "Iniciar sesión" : "Crear mi cuenta"}
        </button>
      </form>

      {/* Separador */}
      <div className="relative flex items-center justify-center my-3">
        <div className="border-t border-slate-200 w-full" />
        <span className="bg-white px-3 text-[11px] text-slate-400 uppercase tracking-wider">o</span>
      </div>

      {/* Botón "Continuar con Google" */}
      <form action={google}>
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <GoogleMark />
          {goingToGoogle ? "Abriendo Google…" : "Continuar con Google"}
        </button>
        {googleState?.error && (
          <div className="mt-2">
            <Notice tone="error">{googleState.error}</Notice>
          </div>
        )}
      </form>

      {/* Enlace de cambio de modo */}
      <div className="text-center pt-2">
        {mode === "signin" ? (
          <p className="text-xs text-slate-500">
            ¿No tienes una cuenta?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="text-blue-600 font-semibold hover:underline cursor-pointer"
            >
              Regístrate
            </button>
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            ¿Ya tienes una cuenta?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-blue-600 font-semibold hover:underline cursor-pointer"
            >
              Inicia sesión
            </button>
          </p>
        )}
      </div>
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
