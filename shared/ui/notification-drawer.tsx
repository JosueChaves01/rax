"use client";

import Link from "next/link";
import { useEffect } from "react";

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  timeAgo: string;
  kind: "material" | "review" | "task" | "session" | "ai";
  href: string;
}

export const DEFAULT_NOTIFICATIONS: NotificationItem[] = [];

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications?: NotificationItem[];
}

export function NotificationDrawer({ isOpen, onClose, notifications }: NotificationDrawerProps) {
  const items = notifications || [];
  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const KIND_ICON = {
    material: "📚",
    review: "🤖",
    task: "⏳",
    session: "📅",
    ai: "💡",
  };

  const KIND_COLOR = {
    material: "bg-blue-50 text-blue-600 border-blue-200",
    review: "bg-purple-50 text-purple-600 border-purple-200",
    task: "bg-amber-50 text-amber-800 border-amber-200",
    session: "bg-emerald-50 text-emerald-600 border-emerald-200",
    ai: "bg-indigo-50 text-indigo-600 border-indigo-200",
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="notif-title">
      {/* Fondo oscuro traslúcido */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-sm sm:max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
          {/* Cabecera */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900" id="notif-title">
                Lo que te espera
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                {items.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              aria-label="Cerrar pendientes"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Lista de Notificaciones */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nada te espera ahora. Cuando alguien te pida algo o te toque mover un proyecto, aparece aquí.
              </div>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={onClose}
                  className="p-4 sm:p-5 flex items-start gap-3 hover:bg-slate-50 transition-colors group block"
                >
                  <div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 text-base ${KIND_COLOR[n.kind]}`}
                  >
                    {KIND_ICON[n.kind]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {n.title}
                      </p>
                      <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                        {n.timeAgo}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                      {n.detail}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Pie de panel */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>Se calcula con el estado real de tus proyectos</span>
            <button
              type="button"
              onClick={onClose}
              className="font-semibold text-blue-600 hover:underline"
            >
              Cerrar panel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

