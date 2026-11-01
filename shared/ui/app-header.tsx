"use client";

import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { ROLE_LABEL } from "@/features/labels";
import type { Profile } from "@/types/domain";

interface AppHeaderProps {
  actor: Profile;
  onOpenNotifications: () => void;
  unreadCount?: number;
}

export function AppHeader({ actor, onOpenNotifications, unreadCount = 0 }: AppHeaderProps) {
  return (
    <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      {/* En celular no hay barra lateral: el logo lleva al inicio del rol. */}
      <Link href={actor.role === "admin" ? "/app/admin" : "/app"} className="md:hidden text-xl font-black tracking-tight text-slate-900">
        <span className="text-blue-600">R</span>AX
      </Link>
      <div className="hidden md:block" />

      {/* Acciones de la derecha: Notificaciones + Perfil */}
      <div className="flex items-center gap-4">
        {/* Pendientes reales de la persona */}
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={unreadCount > 0 ? `Ver ${unreadCount} pendientes` : "Ver pendientes"}
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
              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md text-xs transition-colors"
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
