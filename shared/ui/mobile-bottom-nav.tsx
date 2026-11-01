"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/types/domain";
import { cx } from "./primitives";
import { NavGlyph, isActive, navFor } from "./nav-items";

interface MobileBottomNavProps {
  role: Role;
}

/** Barra inferior en celular: las 3 primeras entradas del menú del rol y «Más» con el resto. */
export function MobileBottomNav({ role }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const currentProjectId = pathname.match(/\/app\/p\/([^/]+)/)?.[1];
  const chatHref = currentProjectId ? `/app/chat?project=${currentProjectId}` : "/app/chat";
  const { main, support } = navFor(role, chatHref);
  const all = [...main, ...support];
  const bar = all.slice(0, 3);
  const rest = all.slice(3);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {open && rest.length > 0 && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-xl">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Más secciones</p>
            <ul className="grid grid-cols-2 gap-2">
              {rest.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={cx(
                      "flex items-center gap-2 rounded-xl border px-3 py-3 text-sm",
                      isActive(item, pathname) ? "border-blue-300 bg-blue-50 text-blue-700 font-semibold" : "border-slate-200 text-slate-700",
                    )}
                  >
                    <NavGlyph icon={item.icon} className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-white border-t border-slate-200 px-2 py-1 shadow-lg pb-[env(safe-area-inset-bottom)]"
        aria-label="Navegación móvil"
      >
        <div className={cx("grid items-center", rest.length > 0 ? "grid-cols-4" : bar.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {bar.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors",
                  active ? "text-blue-600 font-semibold" : "text-slate-500 hover:text-slate-900",
                )}
              >
                <NavGlyph icon={item.icon} className="w-5 h-5" />
                <span className="mt-1">{item.label}</span>
              </Link>
            );
          })}
          {rest.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={cx(
                "flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors",
                open || rest.some((i) => isActive(i, pathname)) ? "text-blue-600 font-semibold" : "text-slate-500 hover:text-slate-900",
              )}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
              <span className="mt-1">Más</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
