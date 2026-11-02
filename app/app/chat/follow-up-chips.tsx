"use client";

/** Respuestas sugeridas a la última respuesta del agente. Sin sugerencias no se muestra nada. */
export function FollowUpChips({
  suggestions,
  disabled,
  onPick,
  className = "",
}: {
  suggestions?: string[];
  disabled?: boolean;
  onPick: (text: string) => void;
  className?: string;
}) {
  if (!suggestions?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Respuestas sugeridas">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s)}
          className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] text-slate-600 hover:text-slate-900 hover:border-slate-400 disabled:opacity-50 transition cursor-pointer"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
