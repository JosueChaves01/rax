import type { Role } from "@/types/domain";

/**
 * Menú de la app según el alcance (docs/alcance.md): cada rol ve solo lo suyo, separado en
 * «Tu trabajo» (el ciclo del proyecto) y «Apoyo». Lo usan la barra lateral y la navegación móvil.
 * Mantener alineado con PLATFORM_PAGES en lib/ai/platform-guide.ts.
 */

export type NavIcon = "home" | "inbox" | "people" | "ai" | "tasks" | "calendar" | "doc" | "book" | "library" | "ops" | "chart";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** Solo activa con la ruta exacta (Inicio). */
  exact?: boolean;
}

export interface NavGroups {
  main: NavItem[];
  support: NavItem[];
}

export function navFor(role: Role, chatHref = "/app/chat"): NavGroups {
  if (role === "admin") {
    return {
      main: [{ label: "Operaciones", href: "/app/admin", icon: "ops" }],
      support: [{ label: "Reportes", href: "/app/reportes", icon: "chart" }],
    };
  }
  if (role === "mentor") {
    return {
      main: [
        { label: "Bandeja", href: "/app", icon: "inbox", exact: true },
        { label: "Emprendedores", href: "/app/mentor", icon: "people", exact: true },
        { label: "Asistente IA", href: chatHref, icon: "ai" },
        { label: "Sesiones", href: "/app/sesiones", icon: "calendar" },
        { label: "Tareas", href: "/app/tareas", icon: "tasks" },
      ],
      support: [
        { label: "Documentos", href: "/app/documentos", icon: "doc" },
        { label: "Aprendizaje", href: "/app/aprendizaje", icon: "book" },
        { label: "Recursos", href: "/app/mentor/recursos", icon: "library" },
      ],
    };
  }
  return {
    main: [
      { label: "Mis proyectos", href: "/app", icon: "home", exact: true },
      { label: "Asistente IA", href: chatHref, icon: "ai" },
      { label: "Tareas", href: "/app/tareas", icon: "tasks" },
      { label: "Sesiones", href: "/app/sesiones", icon: "calendar" },
    ],
    support: [
      { label: "Documentos", href: "/app/documentos", icon: "doc" },
      { label: "Aprendizaje", href: "/app/aprendizaje", icon: "book" },
    ],
  };
}

/** Si el elemento corresponde a la ruta actual. Las páginas de un proyecto cuentan como Inicio. */
export function isActive(item: NavItem, pathname: string): boolean {
  const base = item.href.split("?")[0];
  if (base === "/app" && pathname.startsWith("/app/p/")) return true;
  if (base === "/app/sesiones" && pathname.startsWith("/app/calendario")) return true;
  if (item.exact) return pathname === base;
  return pathname === base || pathname.startsWith(base + "/");
}

export function NavGlyph({ icon, className = "w-4 h-4" }: { icon: NavIcon; className?: string }) {
  const p = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true } as const;
  switch (icon) {
    case "home":
      return (
        <svg {...p}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...p}>
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
    case "people":
      return (
        <svg {...p}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "ai":
      return (
        <svg {...p}>
          <path d="M12 2a8 8 0 0 0-8 8c0 3.37 2.07 6.25 5 7.42V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2.58c2.93-1.17 5-4.05 5-7.42a8 8 0 0 0-8-8z" />
          <line x1="9.5" x2="9.5" y1="9" y2="9.01" />
          <line x1="14.5" x2="14.5" y1="9" y2="9.01" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...p}>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...p}>
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" />
          <line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      );
    case "doc":
      return (
        <svg {...p}>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
        </svg>
      );
    case "book":
      return (
        <svg {...p}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      );
    case "library":
      return (
        <svg {...p}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M6 6h10" />
          <path d="M6 10h10" />
        </svg>
      );
    case "ops":
      return (
        <svg {...p}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "chart":
      return (
        <svg {...p}>
          <line x1="18" x2="18" y1="20" y2="10" />
          <line x1="12" x2="12" y1="20" y2="4" />
          <line x1="6" x2="6" y1="20" y2="14" />
        </svg>
      );
  }
}
