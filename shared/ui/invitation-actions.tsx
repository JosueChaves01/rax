"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondInvitationAction } from "@/app/actions/client";
import { cx } from "./primitives";

/**
 * Aceptar / Rechazar una invitación a un proyecto (flujo B2B). Se usa en la campana y en el inicio.
 * Al aceptar abre la entrevista del proyecto; al rechazar, la invitación desaparece.
 */
export function InvitationActions({
  invitationId,
  size = "sm",
  onDone,
}: {
  invitationId: string;
  size?: "sm" | "md";
  /** Después de responder (p. ej. cerrar la campana). */
  onDone?: (accepted: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<"accepted" | "declined" | null>(null);

  const respond = (accept: boolean) =>
    start(async () => {
      setError(null);
      const res = await respondInvitationAction(invitationId, accept);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAnswered(accept ? "accepted" : "declined");
      onDone?.(accept);
      if (accept && res.data) router.push(`/app/p/${res.data.projectId}/intake`);
      else router.refresh();
    });

  if (answered === "declined") return <p className="text-xs text-slate-500">Rechazaste la invitación.</p>;
  if (answered === "accepted") return <p className="text-xs text-emerald-700">Listo: ya eres parte del proyecto.</p>;

  const base = size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(true)}
          className={cx(base, "rounded-lg bg-blue-600 font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60")}
        >
          {pending ? "Un momento…" : "Aceptar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(false)}
          className={cx(base, "rounded-lg border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60")}
        >
          Rechazar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
