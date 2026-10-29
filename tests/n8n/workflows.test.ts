import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Validación Estructural de Workflows de n8n (v1+)", () => {
  const workflowsDir = path.resolve(__dirname, "../../workflows/n8n");
  const expectedWorkflows = [
    "RAX-00-health-check.json",
    "RAX-01-event-ingress.json",
    "RAX-02-mentor-chat.json",
    "RAX-03-context-memory.json",
    "RAX-04-diagnosis.json",
    "RAX-05-session-preparation.json",
    "RAX-06-session-synthesis.json",
    "RAX-07-goals-action-plan.json",
    "RAX-08-task-proposals.json",
    "RAX-09-next-intervention.json",
    "RAX-10-accountability-reminders.json",
    "RAX-11-resource-recommendations.json",
    "RAX-12-experiment-design.json",
    "RAX-13-evidence-analysis.json",
    "RAX-14-cycle-evaluation.json",
    "RAX-15-operational-metrics.json",
    "RAX-90-error-handler.json",
    "RAX-91-controlled-reprocessing.json",
    "RAX-99-ai-evaluation.json",
  ];

  it("verifica que existan los 19 archivos de workflows requeridos", () => {
    expect(fs.existsSync(workflowsDir)).toBe(true);
    for (const file of expectedWorkflows) {
      const filePath = path.join(workflowsDir, file);
      expect(fs.existsSync(filePath), `Falta el workflow: ${file}`).toBe(true);
    }
  });

  expectedWorkflows.forEach((file) => {
    it(`valida la sintaxis y estructura estándar de n8n en ${file}`, () => {
      const content = fs.readFileSync(path.join(workflowsDir, file), "utf-8");
      const json = JSON.parse(content);

      expect(json).toHaveProperty("name");
      expect(typeof json.name).toBe("string");
      expect(json).toHaveProperty("nodes");
      expect(Array.isArray(json.nodes)).toBe(true);
      expect(json.nodes.length).toBeGreaterThan(0);
      expect(json).toHaveProperty("connections");
      expect(typeof json.connections).toBe("object");

      // Validar cada nodo individual
      for (const node of json.nodes) {
        expect(node).toHaveProperty("id");
        expect(node).toHaveProperty("name");
        expect(node).toHaveProperty("type");
        expect(node).toHaveProperty("position");
        expect(Array.isArray(node.position)).toBe(true);
        expect(node.position.length).toBe(2);
      }
    });
  });

  it("verifica que ningún workflow contenga claves secretas hardcodeadas", () => {
    for (const file of expectedWorkflows) {
      const content = fs.readFileSync(path.join(workflowsDir, file), "utf-8");
      // No debe contener valores de API keys reales (sk-or-..., eyJ...)
      expect(content).not.toMatch(/sk-or-v1-[a-zA-Z0-9]{32,}/);
      expect(content).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{20,}/);
    }
  });
});

