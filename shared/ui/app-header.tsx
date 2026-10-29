"use client";

import { useState } from "react";
import { signOutAction } from "@/app/actions";
import { ROLE_LABEL } from "@/features/labels";
import type { Profile } from "@/types/domain";

interface AppHeaderProps {
  actor: Profile;
  onOpenNotifications: () => void;
  unreadCount?: number;
}

export function AppHeader({ actor, onOpenNotifications, unreadCount = 5 }: AppHeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      {/* Buscador global tipo mock */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" x2="16.65" y1="21" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-full text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Acciones de la derecha: Notificaciones + Perfil */}
      <div className="flex items-center gap-4">
        {/* Campana de Notificaciones (Panel 15) */}
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label="Abrir panel de estados y notificaciones"
          className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Separador vertical */}
        <div className="h-6 w-px bg-slate-200" />

        {/* Perfil de usuario */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase shrink-0 border border-blue-200">
            {actor.name.slice(0, 2)}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[120px]">
              {actor.name}
            </p>
            <p className="text-[10px] text-slate-500">
              {ROLE_LABEL[actor.role]}
            </p>
          </div>

          {/* Botón Salir */}
          <form action={signOutAction} className="ml-1">
            <button
              type="submit"
              title="Cerrar sesión"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md text-xs transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
