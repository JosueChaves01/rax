"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./primitives";

interface MobileBottomNavProps {
  onOpenMore?: () => void;
}

export function MobileBottomNav({ onOpenMore }: MobileBottomNavProps) {
  const pathname = usePathname();
  const currentProjectId = pathname.match(/\/app\/p\/([^/]+)/)?.[1];
  const chatHref = currentProjectId ? `/app/chat?project=${currentProjectId}` : "/app/chat";

  const links = [
    {
      label: "Inicio",
      href: "/app",
      exact: true,
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      label: "IA Assistant",
      href: chatHref,
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a8 8 0 0 0-8 8c0 3.37 2.07 6.25 5 7.42V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2.58c2.93-1.17 5-4.05 5-7.42a8 8 0 0 0-8-8z" />
          <line x1="9.5" x2="9.5" y1="9" y2="9.01" />
          <line x1="14.5" x2="14.5" y1="9" y2="9.01" />
          <path d="M10 13c.5.5 1.5.5 2 0" />
        </svg>
      ),
    },
    {
      label: "Sesiones",
      href: "/app/sesiones",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 px-2 py-1 shadow-lg pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación móvil inferior"
    >
      <div className="grid grid-cols-4 items-center">
        {links.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);

          return (
            <Link
              key={link.label}
              href={link.href}
              className={cx(
                "flex flex-col items-center justify-center py-2 text-[10px] font-medium transition-colors",
                isActive ? "text-blue-600 font-semibold" : "text-slate-500 hover:text-slate-900"
              )}
            >
              {link.icon}
              <span className="mt-1">{link.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          className="flex flex-col items-center justify-center py-2 text-[10px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
          <span className="mt-1">Más</span>
        </button>
      </div>
    </nav>
  );
}

