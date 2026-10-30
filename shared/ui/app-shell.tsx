"use client";

import { useState } from "react";
import type { Profile } from "@/types/domain";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { NotificationDrawer, type NotificationItem, DEFAULT_NOTIFICATIONS } from "./notification-drawer";
import { MobileBottomNav } from "./mobile-bottom-nav";

interface AppShellProps {
  actor: Profile;
  notifications?: NotificationItem[];
  children: React.ReactNode;
}

export function AppShell({ actor, notifications, children }: AppShellProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const items = notifications && notifications.length > 0 ? notifications : DEFAULT_NOTIFICATIONS;

  return (
    <div className="flex min-h-dvh bg-[#f8fafc] text-slate-900 font-sans antialiased">
      {/* 1. Sidebar oscura persistente (Paneles 1 a 13) */}
      <AppSidebar role={actor.role} userName={actor.name} />

      {/* 2. Área principal de trabajo */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Encabezado global con búsqueda y notificaciones */}
        <AppHeader
          actor={actor}
          onOpenNotifications={() => setNotificationsOpen(true)}
          unreadCount={items.length}
        />

        {/* Contenedor central con scroll suave y padding ergonómico */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto pb-24 md:pb-12">
          {children}
        </main>

        {/* Navegación móvil inferior (Panel 14) */}
        <MobileBottomNav onOpenMore={() => setNotificationsOpen(true)} />
      </div>

      {/* 3. Cajón de estados y notificaciones (Panel 15) */}
      <NotificationDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={items}
      />
    </div>
  );
}

