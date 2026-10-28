import { describe, expect, it } from "vitest";
import { BACKEND } from "./helpers";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { seedDemo } from "./fixtures/flow-seed";

describe.runIf(BACKEND === "memory")("flujo completo (fixture)", () => {
  it("se generan con los servicios reales sin errores", async () => {
    const repo = createMemoryRepository();
    await seedDemo(repo);
    const projects = await repo.projects.list();
    expect(projects).toHaveLength(2);
    const items = await repo.diagnosisItems.list({ projectId: projects[0].id });
    expect(items.length).toBeGreaterThan(8);
  });
});
