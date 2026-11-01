"use client";

import { useState } from "react";
import type { Profile } from "@/types/domain";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { NotificationDrawer, type NotificationItem } from "./notification-drawer";
import { MobileBottomNav } from "./mobile-bottom-nav";

interface AppShellProps {
  actor: Profile;
  notifications?: NotificationItem[];
  children: React.ReactNode;
}

export function AppShell({ actor, notifications = [], children }: AppShellProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-[#f8fafc] text-slate-900 font-sans antialiased">
      <AppSidebar role={actor.role} userName={actor.name} />

      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader actor={actor} onOpenNotifications={() => setNotificationsOpen(true)} unreadCount={notifications.length} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto pb-24 md:pb-12">{children}</main>

        <MobileBottomNav role={actor.role} />
      </div>

      <NotificationDrawer isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} notifications={notifications} />
    </div>
  );
}
