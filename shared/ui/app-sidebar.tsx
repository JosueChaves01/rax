"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/types/domain";
import { cx } from "./primitives";
import { NavGlyph, isActive, navFor, type NavItem } from "./nav-items";

interface AppSidebarProps {
  role: Role;
  userName: string;
}

const ROLE_BADGE: Record<Role, string> = { entrepreneur: "Emprendedor", mentor: "Mentor", admin: "Admin" };

export function AppSidebar({ role }: AppSidebarProps) {
  const pathname = usePathname();
  const currentProjectId = pathname.match(/\/app\/p\/([^/]+)/)?.[1];
  const chatHref = currentProjectId ? `/app/chat?project=${currentProjectId}` : "/app/chat";
  const { main, support } = navFor(role, chatHref);
  const home = role === "admin" ? "/app/admin" : "/app";

  return (
    <aside
      className="hidden md:flex flex-col w-56 shrink-0 bg-[#0b132b] text-slate-300 min-h-dvh border-r border-slate-800 select-none z-20"
      aria-label="Navegación principal"
    >
      <div className="h-16 flex items-center px-6 border-b border-slate-800/80">
        <Link href={home} className="flex items-center gap-2 group">
          <span className="text-2xl font-black tracking-tight text-white font-sans">
            <span className="text-blue-500">R</span>AX
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {ROLE_BADGE[role]}
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <NavSection title="Tu trabajo" items={main} pathname={pathname} />
        {support.length > 0 && <NavSection title="Apoyo" items={support} pathname={pathname} className="mt-6" />}
      </nav>

      {role !== "admin" && (
        <div className="p-3 border-t border-slate-800/80">
          <Link
            href={chatHref}
            className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 transition-colors group"
            title={currentProjectId ? "Abrir el asistente con este proyecto" : "Abrir el asistente"}
          >
            <div className="w-8 h-8 rounded-full bg-blue-600/30 text-blue-400 group-hover:bg-blue-600/50 flex items-center justify-center font-bold text-xs shrink-0 transition-colors">
              RAX
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">Asistente IA</p>
              <p className="text-[10px] text-slate-400 truncate">
                {currentProjectId ? "Con este proyecto" : "Te guía paso a paso"}
              </p>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}

function NavSection({ title, items, pathname, className }: { title: string; items: NavItem[]; pathname: string; className?: string }) {
  return (
    <div className={className}>
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  active ? "bg-blue-600 text-white shadow-xs font-semibold" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60",
                )}
              >
                <span className={cx("shrink-0", active ? "text-white" : "text-slate-400")}>
                  <NavGlyph icon={item.icon} />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
