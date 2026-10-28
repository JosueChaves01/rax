import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Primitivas visuales compartidas. Sin lógica de dominio. */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong shadow-[0_0_0_1px_rgb(255_74_28/0.4),0_8px_24px_-8px_rgb(255_74_28/0.6)]",
  secondary: "bg-raised text-ink hover:bg-graphite border border-line-strong",
  ghost: "text-muted hover:text-ink hover:bg-white/5",
  danger: "text-danger border border-danger/40 hover:bg-danger/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[0.6875rem]" : "h-10 px-5 text-xs",
        VARIANT[variant],
        className,
      )}
    />
  );
}

export function Tag({ children, color, dashed, title }: { children: ReactNode; color?: string; dashed?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium leading-4 whitespace-nowrap",
        dashed ? "border-dashed" : "",
      )}
      style={color ? { color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` } : undefined}
    >
      {children}
    </span>
  );
}

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "article" | "div" | "li" }) {
  return <As className={cx("rounded-2xl border border-line bg-panel", className)}>{children}</As>;
}

export function Heading({ children, highlight, level = 2, className }: { children: ReactNode; highlight?: ReactNode; level?: 1 | 2 | 3; className?: string }) {
  const size = level === 1 ? "text-5xl sm:text-6xl" : level === 2 ? "text-3xl sm:text-4xl" : "text-2xl";
  const H = `h${level}` as "h1" | "h2" | "h3";
  return (
    <H className={cx("display", size, className)}>
      {children}
      {highlight && <> <span className="text-highlight">{highlight}</span></>}
    </H>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const tones = {
    info: "border-cyan/30 bg-cyan/5 text-ink",
    error: "border-danger/40 bg-danger/10 text-ink",
    success: "border-ok/40 bg-ok/10 text-ink",
    warn: "border-highlight/40 bg-highlight/10 text-ink",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="display text-2xl text-muted">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-highlight focus:outline-none";

export function Field({ label, hint, error, id, children }: { label: string; hint?: string; error?: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Meter({ value, total, label }: { value: number; total: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[0.6875rem] text-muted">
        <span>{label}</span>
        <span>
          {String(value).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="h-[3px] rounded bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded bg-accent" style={{ width: `${(value / total) * 100}%` }} />
      </div>
    </div>
  );
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Zona horaria de presentación (Costa Rica, UTC−6 sin horario de verano). Determinista en servidor y navegador. */
export const DISPLAY_UTC_OFFSET_HOURS = -6;

export function formatDate(iso: string) {
  const d = new Date(Date.parse(iso) + DISPLAY_UTC_OFFSET_HOURS * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm}`;
}
