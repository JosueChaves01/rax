import "server-only";
import type { AiProposalItem } from "@/lib/n8n/contracts";
import type { ServiceDeps } from "@/lib/services/base";
import { guard } from "@/lib/services/base";

/** Definición estándar de herramientas JSON Schema para OpenRouter / Claude Tool Calling */
export interface WorkflowToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const RAX_WORKFLOW_TOOLS: WorkflowToolDefinition[] = [
  {
    name: "extract_diagnosis_items",
    description: "Workflow RAX-04: Extrae afirmaciones, supuestos, observaciones o incógnitas para incorporarlas al diagnóstico estructurado del proyecto.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Lista de elementos de diagnóstico identificados",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: ["context", "people_market", "problem", "solutions", "financial", "operational", "commercial", "legal", "risk", "open_question"],
                description: "Categoría de negocio del elemento",
              },
              title: { type: "string", description: "Título breve del elemento" },
              content: { type: "string", description: "Detalle o evidencia textual" },
              uncertainty: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
                description: "Nivel de incertidumbre o riesgo",
              },
              infoType: {
                type: "string",
                enum: ["entrepreneur_statement", "documented_observation", "ai_interpretation", "metric_fact"],
                description: "Tipo de información de la afirmación",
              },
            },
            required: ["category", "title", "content", "uncertainty"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "design_experiment",
    description: "Workflow RAX-12: Diseña una hipótesis comprobable y su experimento con métrica ex-ante y criterios de éxito y descarte antes de ejecutar.",
    parameters: {
      type: "object",
      properties: {
        hypothesisStatement: { type: "string", description: "Afirmación concreta a comprobar" },
        segment: { type: "string", description: "Segmento de clientes o usuarios objetivo" },
        question: { type: "string", description: "Pregunta que el experimento responderá" },
        method: { type: "string", description: "Metodología del experimento (entrevistas, preventa, landing, prototipo)" },
        metric: { type: "string", description: "Métrica observable (ej. tasa de conversión, cartas de intención)" },
        successCriterion: { type: "string", description: "Criterio de éxito numérico fijado antes de mirar resultados" },
        rejectionCriterion: { type: "string", description: "Criterio de descarte numérico fijado antes de mirar resultados" },
      },
      required: ["hypothesisStatement", "segment", "question", "method", "metric", "successCriterion", "rejectionCriterion"],
    },
  },
  {
    name: "propose_tasks",
    description: "Workflow RAX-08: Sugiere tareas prioritarias y plan de acción para el proyecto (tareas operativas, aprendizaje de habilidades o investigación) con fecha límite estimada.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: "Lista de tareas sugeridas",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título de la tarea" },
              actionType: {
                type: "string",
                enum: ["experiment", "operational_task", "skill_learning", "research"],
                description: "Tipo de tarea (operativa, aprendizaje/habilidad, investigación, experimento)",
              },
              dueDate: { type: "string", description: "Fecha estimada YYYY-MM-DD" },
              blockedReason: { type: "string", description: "Motivo si requiere desbloqueo previo" },
            },
            required: ["title"],
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "synthesize_session",
    description: "Workflow RAX-06: Sintetiza los acuerdos y compromisos tomados en una sesión de mentoría o tutoría.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Resumen ejecutivo de la sesión" },
        keyAgreements: { type: "array", items: { type: "string" }, description: "Acuerdos alcanzados" },
        commitments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              assignee: { type: "string" },
            },
            required: ["title"],
          },
          description: "Compromisos para la próxima sesión",
        },
      },
      required: ["summary", "keyAgreements"],
    },
  },
  {
    name: "generate_mentor_briefing",
    description: "Workflow RAX-05: Prepara el briefing de la próxima sesión de mentoría o tutoría con temas clave, vacíos conceptuales o puntos ciegos.",
    parameters: {
      type: "object",
      properties: {
        focusAreas: { type: "array", items: { type: "string" }, description: "Temas centrales de la sesión o tutoría" },
        blindSpots: { type: "array", items: { type: "string" }, description: "Puntos ciegos o dificultades conceptuales identificadas" },
        suggestedQuestions: { type: "array", items: { type: "string" }, description: "Preguntas sugeridas para el mentor o tutor" },
      },
      required: ["focusAreas", "suggestedQuestions"],
    },
  },
  {
    name: "diagnose_task_delays",
    description: "Workflow RAX-09: Analiza tareas retrasadas o bloqueadas y propone acciones de intervención para el mentor/equipo.",
    parameters: {
      type: "object",
      properties: {
        causeCategory: {
          type: "string",
          enum: ["time_limit", "unclear_priority", "external_dependency", "scope_too_large", "technical_block"],
          description: "Causa principal del retraso",
        },
        detail: { type: "string", description: "Explicación objetiva y no punitiva" },
        suggestedAction: { type: "string", description: "Acción correctiva sugerida" },
      },
      required: ["causeCategory", "detail", "suggestedAction"],
    },
  },
  {
    name: "recommend_resources",
    description: "Workflow RAX-11: Recomienda recursos de aprendizaje, guías pedagógicas y plantillas metodológicas de RAX según la etapa del proyecto o necesidad formativa.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Área temática requerida" },
        reason: { type: "string", description: "Por qué es relevante para la etapa actual" },
      },
      required: ["topic", "reason"],
    },
  },
  {
    name: "evaluate_mentorship_cycle",
    description: "Workflow RAX-14: Evalúa el ciclo de mentoría, nivel de cumplimiento de metas y madurez de la iniciativa.",
    parameters: {
      type: "object",
      properties: {
        goalsAchieved: { type: "number", description: "Metas cumplidas" },
        goalsTotal: { type: "number", description: "Total de metas planificadas" },
        maturityLevel: { type: "string", description: "Nivel de madurez actual de la iniciativa" },
        summary: { type: "string", description: "Resumen evaluativo del ciclo" },
      },
      required: ["goalsAchieved", "goalsTotal", "summary"],
    },
  },
  {
    name: "query_project_metrics",
    description: "Workflow RAX-15: Consulta métricas operativas del proyecto (tareas, hipótesis, experimentos, sesiones).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "setup_mentorship_project",
    description: "Workflow de Exploración y Vinculación: Estructura la creación de un nuevo proyecto y relación de mentoría para que un mentor trabaje con un cliente (perfil, diagnóstico, compatibilidad y acuerdo preliminar).",
    parameters: {
      type: "object",
      properties: {
        initiativeName: { type: "string", description: "Nombre de la iniciativa o startup del cliente" },
        sector: { type: "string", description: "Industria o sector de actividad" },
        nature: { type: "string", enum: ["exploring_idea", "designing_solution", "operating_business", "unknown"], description: "Etapa de la iniciativa" },
        motivation: { type: "string", enum: ["scale", "skills", "validate", "network", "blocker", "other"], description: "Motivación principal del cliente" },
        description: { type: "string", description: "Situación actual y desafíos prioritarios" },
        compatibilityRationale: { type: "string", description: "Justificación de compatibilidad y valor del mentor" },
        frequency: { type: "string", enum: ["weekly", "biweekly", "monthly"], description: "Frecuencia sugerida de sesiones" },
        cycleGoals: { type: "string", description: "Objetivos principales del ciclo de mentoría" },
        scope: { type: "string", description: "Alcance del acompañamiento" },
      },
      required: ["initiativeName", "sector", "description", "cycleGoals"],
    },
  },
];

export interface WorkflowToolExecutionResult {
  ok: boolean;
  toolName: string;
  summary: string;
  proposals: AiProposalItem[];
  data?: Record<string, unknown>;
}

export function makeProposal(
  item: Omit<AiProposalItem, "uncertainties" | "needsHumanApproval"> & {
    needsHumanApproval?: boolean;
    uncertainties?: string[];
  },
): AiProposalItem {
  return {
    needsHumanApproval: true,
    uncertainties: [],
    ...item,
  };
}

/**
 * Despachador universal de herramientas / workflows:
 * Si n8n está encendido en el entorno, despacha vía webhook/subflujo.
 * Si no, ejecuta de forma nativa a través de los servicios de dominio de RAX en TypeScript.
 */
export async function executeWorkflowTool(
  d: ServiceDeps,
  projectId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<WorkflowToolExecutionResult> {
  await guard(d, projectId, "project.read");

  switch (toolName) {
    case "extract_diagnosis_items": {
      const items = (args.items as Array<Record<string, unknown>>) || [];
      const proposals: AiProposalItem[] = items.map((item) =>
        makeProposal({
          type: "diagnosis_item",
          title: String(item.title || "Nuevo elemento de diagnóstico"),
          description: String(item.content || ""),
          category: String(item.category || "problem"),
          needsHumanApproval: true,
        }),
      );

      return {
        ok: true,
        toolName,
        summary: `Se identificaron ${proposals.length} elementos para el diagnóstico del proyecto (Workflow RAX-04).`,
        proposals,
      };
    }

    case "design_experiment": {
      const statement = String(args.hypothesisStatement || "Hipótesis a validar");
      const question = String(args.question || "");
      const method = String(args.method || "");
      const metric = String(args.metric || "");
      const successCriterion = String(args.successCriterion || "");
      const rejectionCriterion = String(args.rejectionCriterion || "");

      const proposals: AiProposalItem[] = [
        makeProposal({
          type: "hypothesis",
          title: statement,
          description: `Segmento: ${String(args.segment || "General")}. Pregunta: ${question}`,
          needsHumanApproval: true,
        }),
        makeProposal({
          type: "experiment",
          title: `Experimento: ${question || statement}`,
          description: `Método: ${method}. Métrica: ${metric}. Criterio de Éxito: ${successCriterion}. Criterio de Descarte: ${rejectionCriterion}`,
          needsHumanApproval: true,
        }),
      ];

      return {
        ok: true,
        toolName,
        summary: `Se formuló la hipótesis y se estructuró el diseño del experimento ex-ante (Workflow RAX-12).`,
        proposals,
      };
    }

    case "propose_tasks": {
      const tasks = (args.tasks as Array<Record<string, unknown>>) || [];
      const proposals: AiProposalItem[] = tasks.map((t) =>
        makeProposal({
          type: "task",
          title: String(t.title || "Nueva tarea"),
          description: t.dueDate ? `Fecha límite propuesta: ${String(t.dueDate)}` : undefined,
          actionType: t.actionType ? (String(t.actionType) as AiProposalItem["actionType"]) : undefined,
          needsHumanApproval: true,
        }),
      );

      return {
        ok: true,
        toolName,
        summary: `Se propusieron ${proposals.length} tareas para el plan de acción (Workflow RAX-08).`,
        proposals,
      };
    }

    case "synthesize_session": {
      const summary = String(args.summary || "");
      const agreements = (args.keyAgreements as string[]) || [];
      const commitments = (args.commitments as Array<Record<string, unknown>>) || [];

      const proposals: AiProposalItem[] = [
        ...agreements.map((agr) =>
          makeProposal({
            type: "agenda_topic" as const,
            title: `Acuerdo: ${agr}`,
            needsHumanApproval: true,
          }),
        ),
        ...commitments.map((c) =>
          makeProposal({
            type: "task" as const,
            title: String(c.title || "Compromiso de sesión"),
            ownerSuggestion: String(c.assignee || ""),
            needsHumanApproval: true,
          }),
        ),
      ];

      return {
        ok: true,
        toolName,
        summary: `Síntesis generada: ${summary.slice(0, 150)}... (${agreements.length} acuerdos y ${commitments.length} compromisos - Workflow RAX-06).`,
        proposals,
      };
    }

    case "generate_mentor_briefing": {
      const focusAreas = (args.focusAreas as string[]) || [];
      const questions = (args.suggestedQuestions as string[]) || [];

      const proposals: AiProposalItem[] = questions.map((q) =>
        makeProposal({
          type: "agenda_topic",
          title: `Pregunta clave: ${q}`,
          description: `Áreas de foco: ${focusAreas.join(", ")}`,
          needsHumanApproval: true,
        }),
      );

      return {
        ok: true,
        toolName,
        summary: `Briefing para la sesión de mentoría estructurado con ${questions.length} preguntas preparadas (Workflow RAX-05).`,
        proposals,
      };
    }

    case "diagnose_task_delays": {
      const cause = String(args.causeCategory || "unclear_priority");
      const detail = String(args.detail || "");
      const action = String(args.suggestedAction || "");

      const proposals: AiProposalItem[] = [
        makeProposal({
          type: "intervention",
          title: `Intervención de desbloqueo (${cause})`,
          description: `${detail} — Acción sugerida: ${action}`,
          needsHumanApproval: true,
        }),
      ];

      return {
        ok: true,
        toolName,
        summary: `Diagnóstico no punitivo de demora completado (Workflow RAX-09).`,
        proposals,
      };
    }

    case "recommend_resources": {
      const topic = String(args.topic || "Metodología");
      const reason = String(args.reason || "");

      const proposals: AiProposalItem[] = [
        makeProposal({
          type: "recommendation",
          title: `Recurso sugerido: Guía de ${topic}`,
          description: reason,
          needsHumanApproval: false,
        }),
      ];

      return {
        ok: true,
        toolName,
        summary: `Recomendación metodológica para ${topic} (Workflow RAX-11).`,
        proposals,
      };
    }

    case "evaluate_mentorship_cycle": {
      const achieved = Number(args.goalsAchieved) || 0;
      const total = Number(args.goalsTotal) || 0;
      const summary = String(args.summary || "");

      const proposals: AiProposalItem[] = [
        makeProposal({
          type: "goal",
          title: `Evaluación de Ciclo: ${achieved}/${total} objetivos logrados`,
          description: summary,
          needsHumanApproval: true,
        }),
      ];

      return {
        ok: true,
        toolName,
        summary: `Evaluación del ciclo de mentoría completada (Workflow RAX-14).`,
        proposals,
      };
    }

    case "query_project_metrics": {
      const [tasks, hypotheses, experiments, sessions] = await Promise.all([
        d.repo.tasks.list({ projectId }),
        d.repo.hypotheses.list({ projectId }),
        d.repo.experiments.list({ projectId }),
        d.repo.mentorSessions.list({ projectId }),
      ]);

      const data = {
        totalTasks: tasks.length,
        completedTasks: tasks.filter((t) => t.status === "done").length,
        totalHypotheses: hypotheses.length,
        approvedHypotheses: hypotheses.filter((h) => h.status === "approved").length,
        totalExperiments: experiments.length,
        completedSessions: sessions.filter((s) => s.status === "completed").length,
      };

      return {
        ok: true,
        toolName,
        summary: `Métricas del proyecto (Workflow RAX-15): ${data.completedTasks}/${data.totalTasks} tareas completadas, ${data.approvedHypotheses}/${data.totalHypotheses} hipótesis aprobadas, ${data.totalExperiments} experimentos diseñados y ${data.completedSessions} sesiones realizadas.`,
        proposals: [],
        data,
      };
    }

    case "setup_mentorship_project": {
      const initiativeName = String(args.initiativeName || "Nueva Iniciativa");
      const sector = String(args.sector || "General");
      const desc = String(args.description || "");
      const frequency = String(args.frequency || "biweekly");
      const scope = String(args.scope || args.cycleGoals || "Acompañamiento en validación y crecimiento");
      const rationale = String(args.compatibilityRationale || "Alineación de objetivos y experiencia sectorial");

      const proposals: AiProposalItem[] = [
        makeProposal({
          type: "goal",
          title: `Acuerdo de mentoría para «${initiativeName}»`,
          description: `Sector: ${sector}. Frecuencia: ${frequency}. Alcance: ${scope}. Justificación: ${rationale}`,
          needsHumanApproval: true,
        }),
        makeProposal({
          type: "task",
          title: `Formalizar relación de mentoría y primer sesión de diagnóstico para ${initiativeName}`,
          description: desc,
          needsHumanApproval: true,
        }),
      ];

      return {
        ok: true,
        toolName,
        summary: `Estructuración del proyecto mentor-cliente para «${initiativeName}» completada con éxito.`,
        proposals,
        data: {
          initiativeName,
          sector,
          frequency,
          scope,
        },
      };
    }

    default:
      return {
        ok: false,
        toolName,
        summary: `Herramienta desconocida: ${toolName}`,
        proposals: [],
      };
  }
}
