import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { seedDemo } from "@/lib/data/demo-seed";

describe("datos DEMO", () => {
  it("se generan con los servicios reales sin errores", async () => {
    const repo = createMemoryRepository();
    await seedDemo(repo);
    const projects = await repo.projects.list();
    expect(projects).toHaveLength(2);
    expect(projects.every((p) => p.isDemo)).toBe(true);
    const items = await repo.diagnosisItems.list({ projectId: projects[0].id });
    expect(items.length).toBeGreaterThan(8);
  });
});
