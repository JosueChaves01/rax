import { describe, expect, it } from "vitest";
import { isActive, navFor } from "@/shared/ui/nav-items";
import { PLATFORM_PAGES } from "@/lib/ai/platform-guide";

const labels = (role: "entrepreneur" | "mentor" | "admin") => {
  const { main, support } = navFor(role);
  return [...main, ...support].map((i) => i.label);
};

describe("menú según el alcance", () => {
  it("cada rol ve solo lo suyo", () => {
    expect(labels("entrepreneur")).toEqual(["Mis proyectos", "Asistente IA", "Tareas", "Sesiones", "Documentos", "Aprendizaje"]);
    expect(labels("mentor")).toEqual(["Bandeja", "Emprendedores", "Asistente IA", "Sesiones", "Tareas", "Documentos", "Aprendizaje", "Recursos"]);
    expect(labels("admin")).toEqual(["Operaciones", "Reportes"]);
  });

  it("no ofrece pantallas fuera de alcance", () => {
    const hrefs = (["entrepreneur", "mentor", "admin"] as const).flatMap((r) => {
      const { main, support } = navFor(r);
      return [...main, ...support].map((i) => i.href);
    });
    for (const out of ["/app/exploracion", "/app/sugerencias", "/app/relaciones", "/app/evaluacion", "/configuracion"]) {
      expect(hrefs).not.toContain(out);
      expect(PLATFORM_PAGES.map((p) => p.path)).not.toContain(out);
    }
  });

  it("la guía del agente nombra las mismas pantallas que el menú de cada rol", () => {
    for (const role of ["entrepreneur", "mentor", "admin"] as const) {
      const { main, support } = navFor(role);
      const guide = PLATFORM_PAGES.filter((p) => p.roles.includes(role)).map((p) => p.path);
      for (const item of [...main, ...support]) expect(guide).toContain(item.href.split("?")[0]);
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
