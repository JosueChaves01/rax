import { describe, expect, it } from "vitest";
import { isActive, navFor } from "@/shared/ui/nav-items";
import { B2B_NAV_PATHS, PLATFORM_PAGES, renderPlatformGuide } from "@/lib/ai/platform-guide";

const labels = (role: "entrepreneur" | "mentor" | "admin", b2b = false) => {
  const { main, support } = navFor(role, "/app/chat", { b2b });
  return [...main, ...support].map((i) => i.label);
};

describe("menú según el alcance", () => {
  it("cada rol ve solo lo suyo", () => {
    expect(labels("entrepreneur")).toEqual(["Mis proyectos", "Asistente IA", "Tareas", "Sesiones", "Documentos", "Aprendizaje"]);
    expect(labels("mentor")).toEqual(["Bandeja", "Emprendedores", "Asistente IA", "Sesiones", "Tareas", "Documentos", "Aprendizaje", "Recursos"]);
    expect(labels("admin")).toEqual(["Operaciones", "Reportes"]);
  });

  it("flujo B2B: menú del mentor y del cliente (la bandera llega del servidor)", () => {
    expect(labels("mentor", true)).toEqual(["Bandeja", "Clientes", "Asistente IA", "Sesiones", "Mi perfil"]);
    expect(labels("entrepreneur", true)).toEqual(["Mis proyectos", "Sesiones", "Material"]);
    expect(labels("admin", true)).toEqual(labels("admin"));
    const hrefs = (role: "entrepreneur" | "mentor") => [...navFor(role, "/app/chat", { b2b: true }).main].map((i) => i.href);
    expect(hrefs("mentor")).toEqual(["/app", "/app/mentor", "/app/chat", "/app/sesiones", "/app/mentor/perfil"]);
    expect(hrefs("entrepreneur")).toEqual(["/app", "/app/sesiones", "/app/documentos"]);
    // Clientes no queda activo dentro de Mi perfil.
    const [, clientes, , , perfil] = navFor("mentor", "/app/chat", { b2b: true }).main;
    expect(isActive(clientes, "/app/mentor/perfil")).toBe(false);
    expect(isActive(perfil, "/app/mentor/perfil")).toBe(true);
  });

  it("no ofrece pantallas fuera de alcance", () => {
    const hrefs = (["entrepreneur", "mentor", "admin"] as const).flatMap((r) =>
      [false, true].flatMap((b2b) => {
        const { main, support } = navFor(r, "/app/chat", { b2b });
        return [...main, ...support].map((i) => i.href);
      }),
    );
    for (const out of ["/app/exploracion", "/app/sugerencias", "/app/relaciones", "/app/evaluacion", "/configuracion"]) {
      expect(hrefs).not.toContain(out);
      expect(PLATFORM_PAGES.map((p) => p.path)).not.toContain(out);
    }
  });

  it("la guía del agente nombra las mismas pantallas que el menú de cada rol", () => {
    for (const b2b of [false, true]) {
      for (const role of ["entrepreneur", "mentor", "admin"] as const) {
        const { main, support } = navFor(role, "/app/chat", { b2b });
        const guide = PLATFORM_PAGES.filter((p) => p.roles.includes(role) && (b2b || !p.flow)).map((p) => p.path);
        for (const item of [...main, ...support]) expect(guide).toContain(item.href.split("?")[0]);
      }
    }
  });

  it("flujo B2B: la guía del agente nombra exactamente el menú de cada rol", () => {
    for (const role of ["entrepreneur", "mentor"] as const) {
      const { main, support } = navFor(role, "/app/chat", { b2b: true });
      expect(B2B_NAV_PATHS[role]).toEqual([...main, ...support].map((i) => i.href.split("?")[0]));
      const guide = renderPlatformGuide(role, { b2b: true });
      for (const path of B2B_NAV_PATHS[role]!) expect(guide).toContain(`(${path})`);
    }
  });

  it("marca la entrada activa", () => {
    const [home, chat] = navFor("entrepreneur").main;
    expect(isActive(home, "/app")).toBe(true);
    expect(isActive(home, "/app/p/123/diagnostico")).toBe(true);
    expect(isActive(home, "/app/tareas")).toBe(false);
    expect(isActive(chat, "/app/chat")).toBe(true);
    const [, cartera] = navFor("mentor").main;
    expect(isActive(cartera, "/app/mentor/recursos")).toBe(false);
  });
});
