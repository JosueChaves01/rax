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
      expect(content).not.toContain("test-shared-secret-rax-n8n");
    }
  });

  it("no reporta eventos como aceptados si RAX-01 no tiene rutas ejecutables", () => {
    const workflow = JSON.parse(fs.readFileSync(path.join(workflowsDir, "RAX-01-event-ingress.json"), "utf-8"));
    const response = workflow.nodes.find((node: { id: string }) => node.id === "node-respond-accepted");

    expect(response.parameters.options.responseCode).toBe(503);
    expect(response.parameters.responseBody).toContain("event was not queued");
    expect(workflow.nodes.some((node: { id: string }) => node.id === "node-switch-event-router")).toBe(false);
  });

  it("RAX-91 no declara que reprocesó un evento sin ejecutar un workflow", () => {
    const workflow = JSON.parse(fs.readFileSync(path.join(workflowsDir, "RAX-91-controlled-reprocessing.json"), "utf-8"));
    const response = workflow.nodes.find((node: { id: string }) => node.id === "node-respond-reprocess-accepted");

    expect(response.parameters.options.responseCode).toBe(501);
    expect(response.parameters.responseBody).toContain("nothing was reprocessed");
  });

  it("RAX-99 identifica sus casos como no ejecutados en vez de falsos aprobados", () => {
    const workflow = JSON.parse(fs.readFileSync(path.join(workflowsDir, "RAX-99-ai-evaluation.json"), "utf-8"));
    const code = workflow.nodes.find((node: { id: string }) => node.id === "node-code-execute-suite").parameters.jsCode;

    expect(code).toContain("status: 'not_run'");
    expect(code).toContain("passed: 0");
    expect(code).toContain("notRun: results.length");
    expect(code).not.toContain("status: 'passed'");
  });

  it("verifica vigencia temporal en RAX-02 y conserva el código de rechazo", () => {
    const workflow = JSON.parse(fs.readFileSync(path.join(workflowsDir, "RAX-02-mentor-chat.json"), "utf-8"));
    const verifier = workflow.nodes.find((node: { id: string }) => node.id === "node-code-sanitize-chat");
    const denied = workflow.nodes.find((node: { id: string }) => node.id === "node-respond-chat-denied");

    expect(verifier.parameters.jsCode).toContain("Math.abs(now - reqTime) > 300");
    expect(verifier.parameters.jsCode).toContain("crypto.timingSafeEqual");
    expect(denied.parameters.options.responseCode).toContain("$json.statusCode");
  });

  it("firma cada callback hacia RAX sobre el cuerpo exacto con timestamp anti-replay", () => {
    const callbackFiles = expectedWorkflows.filter((file) =>
      /RAX-(0[3-9]|1[0-5]|90)-/.test(file),
    );
    for (const file of callbackFiles) {
      const workflow = JSON.parse(fs.readFileSync(path.join(workflowsDir, file), "utf-8"));
      const callback = workflow.nodes.find((node: { type: string; name: string; parameters?: { url?: string } }) =>
        node.type === "n8n-nodes-base.httpRequest" && (/callback|report error/i.test(node.name) || /api\/n8n\/callback/i.test(node.parameters?.url ?? "")),
      );
      expect(callback, `${file}: falta el callback HTTP`).toBeDefined();
      const headers = callback.parameters.headerParameters.parameters;
      expect(headers.find((header: { name: string }) => header.name === "x-rax-signature")?.value).toContain("callbackSignature");
      expect(headers.find((header: { name: string }) => header.name === "x-rax-timestamp")?.value).toContain("callbackTimestamp");
      expect(callback.parameters.jsonBody).toBe("={{ $json.callbackBody }}");

      const signer = workflow.nodes.find((node: { name: string }) => node.name === "Sign RAX Callback");
      expect(signer, `${file}: falta firmador de callback`).toBeDefined();
      expect(signer.parameters.jsCode).toContain("RAX_N8N_SHARED_SECRET");
      expect(signer.parameters.jsCode).toContain("Math.floor(Date.now() / 1000)");
      expect(signer.parameters.jsCode).toContain("timestamp + '.' + callbackBody");
      expect(signer.parameters.jsCode).toContain("JSON.stringify(callbackPayload)");
    }
  });

  it("RAX-02 rechaza JSON inválido del modelo y no fabrica una respuesta de éxito", () => {
    const workflow = JSON.parse(fs.readFileSync(path.join(workflowsDir, "RAX-02-mentor-chat.json"), "utf-8"));
    const formatter = workflow.nodes.find((node: { id: string }) => node.id === "node-code-validate-chat-output");
    const outputGate = workflow.nodes.find((node: { id: string }) => node.id === "node-if-chat-output-valid");
    const rejected = workflow.nodes.find((node: { id: string }) => node.id === "node-respond-chat-invalid");
    const code = formatter.parameters.jsCode as string;

    expect(code).toContain("The model returned invalid JSON");
    expect(code).toContain("The model returned an invalid proposal");
    expect(code).toContain("needsHumanApproval: true");
    expect(code).not.toContain("Entendido. Sigamos profundizando.");
    expect(outputGate.type).toBe("n8n-nodes-base.if");
    expect(workflow.connections["Is Model Output Valid?"].main[1][0].node).toBe(rejected.name);
    expect(rejected.parameters.options.responseCode).toContain("502");
  });

  it("RAX-02 adapta su rol y catálogo de workflows según el actor (apoyo para mentor, guía/intermediario para estudiante/emprendedor)", () => {
    const workflow = JSON.parse(fs.readFileSync(path.join(workflowsDir, "RAX-02-mentor-chat.json"), "utf-8"));
    const verifier = workflow.nodes.find((node: { id: string }) => node.id === "node-code-sanitize-chat");
    const jsCode = verifier.parameters.jsCode as string;

    // 1. Roles y permisos de workflows (RBAC en n8n)
    expect(jsCode).toContain("WORKFLOW_CATALOG");
    expect(jsCode).toContain("'RAX-05': { name: 'Pre-Session Briefing', roles: ['mentor']");
    expect(jsCode).toContain("'RAX-06': { name: 'Session Synthesis', roles: ['mentor']");
    expect(jsCode).toContain("'RAX-04': { name: 'Diagnosis Items', roles: ['entrepreneur']");
    expect(jsCode).toContain("AVISO DE PERMISOS");

    // 2. Rol para Mentor: Apoyo y copiloto profesional
    expect(jsCode).toContain("ROL DEL INTERLOCUTOR: MENTOR O TUTOR");
    expect(jsCode).toContain("Tu función es actuar como APOYO y copiloto profesional para el mentor/tutor");

    // 3. Rol para Estudiante / Emprendedor: Guía e intermediario de preguntas hacia el mentor/tutor
    expect(jsCode).toContain("ROL DEL INTERLOCUTOR: ESTUDIANTE, APRENDIZ O EMPRENDEDOR");
    expect(jsCode).toContain("Tu función es actuar como GUÍA FORMATIVO E INTERMEDIARIO DE PREGUNTAS hacia su mentor o tutor");
    expect(jsCode).toContain("FORMULAR PREGUNTAS CLAVE");
    expect(jsCode).toContain("NUNCA lo desvíes a validar ideas en el mercado");
  });
});

