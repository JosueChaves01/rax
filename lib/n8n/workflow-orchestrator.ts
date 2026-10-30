import "server-only";
import type { Role } from "@/types/domain";
import type { Action } from "@/lib/authz";
import { guard, type ServiceDeps } from "@/lib/services/base";
import {
  invokeMainAgent,
  type RaxCapabilityId,
  selectRaxCapability,
  type MainAgentStage,
} from "./main-agent";
import type { AiProposalItem, ChatSyncRequest } from "./contracts";
import { executeWorkflowTool, makeProposal } from "@/lib/ai/workflow-tools";
import { executeClaudeAgentTurn } from "@/lib/ai/claude-orchestrator";
import { getProjectKnowledgeContext } from "@/lib/ai/knowledge-retrieval";

export interface WorkflowDescriptor {
  id: RaxCapabilityId;
  name: string;
  description: string;
  action: Action;
  roles: readonly Role[];
  mode: "read" | "draft" | "write";
  transport: "n8n_sync" | "n8n_async" | "native";
}

/** Catálogo maestro de los 19 workflows orquestados por el agente */
export const ORCHESTRATED_WORKFLOWS: WorkflowDescriptor[] = [
  { id: "RAX-00", name: "Health Check", description: "Diagnóstico de conectividad e integración n8n ↔ RAX ↔ OpenRouter", action: "admin.manage", roles: ["admin"], mode: "read", transport: "native" },
  { id: "RAX-01", name: "Event Ingress", description: "Ingesta criptográfica y verificación de eventos con idempotencia", action: "project.read", roles: [], mode: "write", transport: "n8n_async" },
  { id: "RAX-02", name: "Mentor Chat", description: "Asistente conversacional principal de mentoría pedagógica", action: "agent.chat", roles: ["entrepreneur", "mentor"], mode: "read", transport: "n8n_sync" },
  { id: "RAX-03", name: "Context Memory", description: "Memoria contextual evolutiva y síntesis de hitos", action: "project.read", roles: ["entrepreneur", "mentor"], mode: "read", transport: "native" },
  { id: "RAX-04", name: "Diagnosis Items", description: "Extracción y categorización continua de diagnóstico (10 categorías)", action: "diagnosis.edit", roles: ["entrepreneur"], mode: "draft", transport: "native" },
  { id: "RAX-05", name: "Pre-Session Briefing", description: "Briefing estructurado y preguntas clave para el mentor antes de una sesión", action: "project.read", roles: ["mentor"], mode: "read", transport: "native" },
  { id: "RAX-06", name: "Session Synthesis", description: "Síntesis estructurada de acuerdos y compromisos post-sesión", action: "diagnosis.comment", roles: ["mentor"], mode: "draft", transport: "native" },
  { id: "RAX-07", name: "Goals & Action Plan", description: "Formulación de metas observables y plan de acción de ciclo", action: "goal.manage", roles: ["entrepreneur", "mentor"], mode: "draft", transport: "native" },
  { id: "RAX-08", name: "Task Proposals", description: "Descomposición de objetivos en tareas accionables y dependencias", action: "task.manage", roles: ["entrepreneur", "mentor"], mode: "draft", transport: "native" },
  { id: "RAX-09", name: "Next Intervention", description: "Diagnóstico no punitivo de bloqueos y sugerencias de intervención", action: "task.diagnose_delay", roles: ["mentor"], mode: "draft", transport: "native" },
  { id: "RAX-10", name: "Accountability Reminders", description: "Recordatorios de compromisos para revisión del mentor", action: "mentor.request_review", roles: ["entrepreneur"], mode: "draft", transport: "native" },
  { id: "RAX-11", name: "Resource Recommendations", description: "Recomendación curada de recursos y plantillas metodológicas", action: "resource.manage", roles: ["entrepreneur", "mentor"], mode: "read", transport: "native" },
  { id: "RAX-12", name: "Experiment Design", description: "Diseño formal de hipótesis refutables y experimentos Lean con criterios numéricos", action: "experiment.design", roles: ["entrepreneur", "mentor"], mode: "draft", transport: "native" },
  { id: "RAX-13", name: "Evidence Analysis", description: "Análisis y verificación de evidencia frente a criterios ex-ante", action: "evidence.add", roles: ["entrepreneur"], mode: "draft", transport: "native" },
  { id: "RAX-14", name: "Cycle Evaluation", description: "Evaluación retrospectiva y cierre/renovación del ciclo de mentoría", action: "cycle.evaluate", roles: ["mentor"], mode: "draft", transport: "native" },
  { id: "RAX-15", name: "Operational Metrics", description: "Consulta de métricas de progreso (tareas, hipótesis, experimentos, sesiones)", action: "admin.manage", roles: ["admin", "entrepreneur", "mentor"], mode: "read", transport: "native" },
  { id: "RAX-90", name: "Central Error Handler", description: "Captura y clasificación de errores de ejecución sin fuga de secretos", action: "admin.manage", roles: ["admin"], mode: "write", transport: "native" },
  { id: "RAX-91", name: "Controlled Reprocessing", description: "Reprocesamiento controlado de eventos fallidos con auditoría", action: "admin.manage", roles: ["admin"], mode: "write", transport: "native" },
  { id: "RAX-99", name: "AI Evaluation Suite", description: "Evaluación determinista de calidad y casos de prueba de IA", action: "admin.manage", roles: ["admin"], mode: "write", transport: "native" },
];

export interface OrchestratorTurnInput {
  projectId: string;
  message: string;
  role: Role;
  flowId?: RaxCapabilityId;
  stage?: MainAgentStage;
  deps: ServiceDeps;
  previousMessages?: Array<{ author: "user" | "assistant"; content: string }>;
}

export interface OrchestratorTurnResult {
  ok: boolean;
  reply: string;
  flowId: RaxCapabilityId;
  transport: "n8n" | "native";
  proposals: AiProposalItem[];
  uncertainties: string[];
  correlationId: string;
}

/**
 * Orquestador Maestro de Workflows de RAX.
 * Intenta ejecutar vía n8n si el canal síncrono está habilitado (en staging/producción).
 * Si n8n está deshabilitado o no disponible, ejecuta la orquestación nativa en TypeScript garantizando cero caídas.
 */
export async function orchestrateWorkflowTurn(
  input: OrchestratorTurnInput,
): Promise<OrchestratorTurnResult> {
  const { d, project } = await (async () => {
    const deps = input.deps;
    const { project } = await guard(deps, input.projectId, "agent.chat");
    return { d: deps, project };
  })();

  const correlationId = d.newId("corr_orch");
  const stage = input.stage || "conversation";

  // 1. Selección y autorización de capacidad
  const initialTurn = {
    role: input.role,
    projectId: input.projectId,
    stage,
    flowId: input.flowId,
    message: input.message,
  };
  const selection = selectRaxCapability(initialTurn);
  const flowId = selection.primary;

  const turn = {
    role: input.role,
    projectId: input.projectId,
    stage,
    flowId,
    message: input.message,
  };

  // 2. Si n8n está habilitado operativamente, intentamos el canal de n8n
  if (process.env.RAX_N8N_MAIN_AGENT_ENABLED === "true") {
    try {
      const [diagnoses, items, tasks, hypotheses, experiments, results, evidence, sessions, relations] =
        await Promise.all([
          d.repo.diagnoses.list({ projectId: project.id }).catch(() => []),
          d.repo.diagnosisItems.list({ projectId: project.id }).catch(() => []),
          d.repo.tasks.list({ projectId: project.id }).catch(() => []),
          d.repo.hypotheses.list({ projectId: project.id }).catch(() => []),
          d.repo.experiments.list({ projectId: project.id }).catch(() => []),
          d.repo.experimentResults.list({ projectId: project.id }).catch(() => []),
          d.repo.evidence.list({ projectId: project.id }).catch(() => []),
          d.repo.mentorSessions.list({ projectId: project.id }).catch(() => []),
          d.repo.mentorshipRelations.list({ projectId: project.id }).catch(() => []),
        ]);

      const goals = (
        await Promise.all(relations.map((relation) => d.repo.mentorshipGoals.list({ relationId: relation.id }).catch(() => [])))
      ).flat();

      const n8nRequest: ChatSyncRequest = {
        correlationId,
        projectId: project.id,
        actor: { id: d.actor.id, role: d.actor.role, verified: true },
        messageId: d.newId("msg"),
        message: input.message,
        workContext: {
          stage,
          flowId,
        },
        context: {
          projectName: project.name,
          projectSummary: diagnoses[0]?.summary ?? project.description ?? null,
          recentMessages: (input.previousMessages || []).slice(-10).map((m) => ({
            author: m.author,
            content: m.content,
            createdAt: d.now(),
          })),
          currentItems: items.slice(0, 30).map((i) => ({
            id: i.id,
            category: i.category,
            title: i.title,
            content: i.content,
            uncertainty: i.uncertainty,
          })),
          relatedRecords: {
            tasks: tasks.slice(0, 20).map((t) => ({ id: t.id, title: t.title, status: t.status })),
            hypotheses: hypotheses.slice(0, 20).map((h) => ({ id: h.id, statement: h.statement, segment: h.segment, status: h.status, uncertainty: h.uncertainty })),
            experiments: experiments.slice(0, 20).map((e) => ({ id: e.id, hypothesisId: e.hypothesisId, question: e.question, method: e.method, metric: e.metric, successCriterion: e.successCriterion, rejectionCriterion: e.rejectionCriterion, status: e.status })),
            results: results.slice(0, 20).map((r) => ({ id: r.id, experimentId: r.experimentId, outcome: r.outcome, observed: r.observed, metricValue: r.metricValue, learnings: r.learnings, limitations: r.limitations })),
            evidence: evidence.slice(0, 20).map((ev) => ({ id: ev.id, kind: ev.kind, title: ev.title, description: ev.description })),
            sessions: sessions.slice(0, 20).map((s) => ({ id: s.id, kind: s.kind, status: s.status })),
            goals: goals.slice(0, 20).map((g) => ({ id: g.id, title: g.title, description: g.description, baseline: g.baseline, targetResult: g.targetResult, status: g.status, priority: g.priority })),
          },
          coveredDimensions: [],
          pendingDimensions: [],
          mentorNotes: [],
        },
      };

      const n8nResult = await invokeMainAgent(turn, n8nRequest);
      if (n8nResult.ok) {
        return {
          ok: true,
          reply: n8nResult.reply,
          flowId,
          transport: "n8n",
          proposals: n8nResult.proposals,
          uncertainties: [],
          correlationId: n8nResult.correlationId,
        };
      }
    } catch (e) {
      console.warn("[orchestrator-agent] Fallo en n8n, ejecutando orquestación nativa:", e);
    }
  }

  // 3. Orquestación Nativa (TypeScript / Claude Orchestrator / Tools Dispatcher)
  const knowledge = await getProjectKnowledgeContext(d.repo, project.id, input.message);
  const history = (input.previousMessages || []).map((m) => ({
    author: m.author,
    content: m.content,
  }));

  const nativeResult = await executeClaudeAgentTurn({
    project,
    userMessage: input.message,
    history,
    knowledge,
    role: input.role,
    deps: d,
  });

  const proposals: AiProposalItem[] = (nativeResult.proposals as AiProposalItem[]).map((p) =>
    makeProposal({
      ...p,
      needsHumanApproval: true,
    }),
  );

  return {
    ok: true,
    reply: nativeResult.reply,
    flowId,
    transport: "native",
    proposals,
    uncertainties: [],
    correlationId,
  };
}

/** Ejecuta directamente una herramienta de workflow específica dentro de la orquestación */
export async function executeWorkflowDirect(
  deps: ServiceDeps,
  projectId: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  return executeWorkflowTool(deps, projectId, toolName, args);
}
