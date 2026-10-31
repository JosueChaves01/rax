import "server-only";
import type { AiProposalItem } from "@/lib/n8n/contracts";
import type { ServiceDeps } from "@/lib/services/base";
import { guard, relationOf } from "@/lib/services/base";
import { can } from "@/lib/authz";
import { parseStepParams, STEP_ACTION_IDS, STEP_ACTIONS, stepActionTitle } from "./step-actions";

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
    name: "update_context_memory",
    description: "Workflow RAX-03: Resume y consolida la memoria contextual a partir de la conversación actual. Extrae la síntesis de lo aprendido o acordado para agregarlo como contexto consolidado de la etapa actual (ej. etapa entender, diagnóstico) o conocimiento persistente.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Resumen estructurado y conciso de lo conversado o descubierto" },
        stage: { type: "string", description: "Etapa del proyecto a la que pertenece este contexto (ej. entender, evaluar, construir, crecer)" },
        keyInsights: {
          type: "array",
          description: "Principales conceptos, certezas o puntos clave confirmados",
          items: { type: "string" },
        },
        openQuestions: {
          type: "array",
          description: "Dudas pendientes, incógnitas o preguntas para el mentor o tutor",
          items: { type: "string" },
        },
      },
      required: ["summary"],
    },
  },
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
    description: "Workflow RAX-12: Sin hypothesisId, formula una HIPÓTESIS comprobable (queda en borrador hasta que se envía al mentor). Con hypothesisId de una hipótesis ya aprobada, diseña su EXPERIMENTO con métrica y criterios de éxito y descarte fijados antes de empezar.",
    parameters: {
      type: "object",
      properties: {
        hypothesisId: { type: "string", description: "Id de la hipótesis aprobada sobre la que se diseña el experimento. Omitir para proponer una hipótesis nueva." },
        hypothesisStatement: { type: "string", description: "Afirmación concreta y observable a comprobar (mínimo 25 caracteres, sin promesas vagas de éxito)" },
        segment: { type: "string", description: "Persona o segmento involucrado" },
        whyItMatters: { type: "string", description: "Por qué importa comprobarla ahora" },
        currentEvidence: { type: "string", description: "Qué evidencia hay hoy" },
        evaluationCriterion: { type: "string", description: "Cómo se va a evaluar" },
        relatedItemId: { type: "string", description: "Id del problema del diagnóstico al que responde" },
        question: { type: "string", description: "Pregunta que el experimento responderá" },
        method: { type: "string", description: "Metodología (entrevistas, preventa, landing, prototipo, ejercicio)" },
        participants: { type: "string", description: "Participantes o fuentes y cuántos" },
        activities: { type: "array", items: { type: "string" }, description: "Actividades concretas" },
        durationDays: { type: "number", description: "Duración en días" },
        metric: { type: "string", description: "Métrica o señal observable" },
        successCriterion: { type: "string", description: "Criterio de éxito fijado antes de mirar resultados" },
        rejectionCriterion: { type: "string", description: "Criterio de descarte fijado antes de mirar resultados" },
        evidencePlan: { type: "string", description: "Qué evidencia se va a recopilar" },
        risks: { type: "string", description: "Riesgos del experimento" },
      },
      required: ["hypothesisStatement"],
    },
  },
  {
    name: "propose_goals",
    description: "Workflow RAX-07: Propone metas de aprendizaje u objetivos observables de desarrollo para el plan de trabajo o tutoría.",
    parameters: {
      type: "object",
      properties: {
        goals: {
          type: "array",
          description: "Lista de metas u objetivos sugeridos",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título del objetivo o meta de aprendizaje" },
              description: { type: "string", description: "Descripción del resultado observable esperado y cómo verificarlo" },
              priority: { type: "string", enum: ["high", "medium", "low"], description: "Prioridad del objetivo" },
              kind: { type: "string", enum: ["metric", "qualitative", "capability", "strategic"], description: "Tipo de objetivo" },
              baseline: { type: "string", description: "Punto de partida actual" },
              targetResult: { type: "string", description: "Resultado esperado al final del ciclo" },
            },
            required: ["title"],
          },
        },
      },
      required: ["goals"],
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
        autonomy: { type: "string", enum: ["nascent", "developing", "autonomous"], description: "Autonomía alcanzada por la persona" },
        decision: { type: "string", enum: ["renew", "close", "new_stage"], description: "Propuesta de cierre: renovar, cerrar o pasar a una nueva etapa" },
        nextCycleFocus: { type: "string", description: "Foco del próximo ciclo, si sigue" },
      },
      required: ["goalsAchieved", "goalsTotal", "summary"],
    },
  },
  {
    name: "propose_step_action",
    description: "Propone dar un paso del recorrido del proyecto (ver «Recorrido» en <project_state>). Genera una tarjeta que la persona aplica con un clic; nada cambia hasta entonces. Usa los ids que aparecen entre corchetes en <project_state>. Acciones: " +
      STEP_ACTION_IDS.map((id) => `${id} (${STEP_ACTIONS[id].needs})`).join("; "),
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: STEP_ACTION_IDS, description: "Paso a dar" },
        targetId: { type: "string", description: "Id del elemento sobre el que actúa (hipótesis, experimento, hallazgo, tarea, sesión o acuerdo)" },
        text: { type: "string", description: "Texto principal: resumen, acuerdo, justificación, nota, lo observado o la valoración" },
        kind: { type: "string", description: "first_review|second_review para request_review; tipo de nota para add_session_note" },
        decision: { type: "string", description: "approve|return|discard (hipótesis); continue|reformulate|deepen|pause|discard (segunda revisión); confirm|reject (hallazgo); renew|close|new_stage (ciclo)" },
        rank: { type: "number", description: "Orden de prioridad (1 = primero)" },
        outcome: { type: "string", enum: ["positive", "negative", "mixed", "inconclusive"], description: "Resultado contra los criterios fijados" },
        metricValue: { type: "string", description: "Valor observado de la métrica" },
        learnings: { type: "string", description: "Aprendizajes" },
        limitations: { type: "string", description: "Limitaciones del resultado" },
        title: { type: "string", description: "Título de la evidencia" },
        url: { type: "string", description: "Enlace de la evidencia" },
        status: { type: "string", enum: ["todo", "doing", "done", "blocked"], description: "Nuevo estado de la tarea" },
        scope: { type: "string", description: "Alcance del acuerdo" },
        frequency: { type: "string", enum: ["weekly", "biweekly", "monthly", "on_demand"], description: "Frecuencia de sesiones" },
        sessionDurationMinutes: { type: "number", description: "Duración de cada sesión en minutos (15 a 240)" },
        expectedDurationWeeks: { type: "number", description: "Duración del ciclo en semanas (1 a 104)" },
        mentorCommitments: { type: "string", description: "Compromisos del mentor" },
        entrepreneurCommitments: { type: "string", description: "Compromisos del emprendedor" },
        scheduledAt: { type: "string", description: "Fecha de la sesión (YYYY-MM-DD o ISO)" },
        autonomy: { type: "string", enum: ["nascent", "developing", "autonomous"], description: "Autonomía (evaluación de ciclo)" },
      },
      required: ["action"],
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
    case "update_context_memory": {
      const summary = String(args.summary || "");
      const stage = String(args.stage || "entender");
      const keyInsights = (args.keyInsights as string[]) || [];
      const openQuestions = (args.openQuestions as string[]) || [];

      const proposals: AiProposalItem[] = [
        makeProposal({
          type: "diagnosis_item",
          title: `Contexto de la etapa «${stage}» — Síntesis de conversación`,
          description: summary + (keyInsights.length > 0 ? `\n\nPuntos clave:\n- ${keyInsights.join("\n- ")}` : ""),
          category: "context",
          needsHumanApproval: true,
        }),
        ...openQuestions.map((q) =>
          makeProposal({
            type: "agenda_topic" as const,
            title: `Pregunta para tutoría: ${q}`,
            description: `Pregunta clave identificada en la etapa «${stage}»`,
            needsHumanApproval: true,
          }),
        ),
      ];

      return {
        ok: true,
        toolName,
        summary: `Se sintetizó la memoria contextual para la etapa «${stage}» (Workflow RAX-03).`,
        proposals,
        data: { summary, stage, keyInsights, openQuestions },
      };
    }

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
      const text = (k: string) => (typeof args[k] === "string" ? String(args[k]).trim() : "");
      const statement = text("hypothesisStatement") || "Hipótesis a comprobar";
      const hypothesisId = text("hypothesisId");

      if (!hypothesisId) {
        return {
          ok: true,
          toolName,
          summary: "Se formuló la hipótesis. Queda en borrador al aplicarla; después se envía al mentor para su aprobación y recién ahí se diseña el experimento.",
          proposals: [
            makeProposal({
              type: "hypothesis",
              title: statement,
              description: [text("segment") && `Segmento: ${text("segment")}`, text("evaluationCriterion") && `Cómo se evalúa: ${text("evaluationCriterion")}`].filter(Boolean).join(". ") || undefined,
              metadata: {
                segment: text("segment"),
                whyItMatters: text("whyItMatters"),
                currentEvidence: text("currentEvidence"),
                evaluationCriterion: text("evaluationCriterion") || text("successCriterion"),
                relatedItemId: text("relatedItemId"),
              },
            }),
          ],
        };
      }

      const hyp = await d.repo.hypotheses.get(hypothesisId);
      if (!hyp || hyp.projectId !== projectId) {
        return { ok: false, toolName, summary: `No existe la hipótesis ${hypothesisId} en este proyecto.`, proposals: [] };
      }
      if (!["approved", "testing", "inconclusive", "supported", "weakened"].includes(hyp.status)) {
        return { ok: false, toolName, summary: "Esa hipótesis todavía no está aprobada por el mentor: no se puede diseñar su experimento.", proposals: [] };
      }
      const question = text("question") || statement;
      const activities = Array.isArray(args.activities) ? args.activities.filter((a): a is string => typeof a === "string") : [];
      return {
        ok: true,
        toolName,
        summary: "Se diseñó el experimento con criterios ex-ante (Workflow RAX-12).",
        proposals: [
          makeProposal({
            type: "experiment",
            title: `Experimento: ${question}`.slice(0, 300),
            description: `Método: ${text("method")}. Métrica: ${text("metric")}. Criterio de Éxito: ${text("successCriterion")}. Criterio de Descarte: ${text("rejectionCriterion")}`,
            metadata: {
              hypothesisId,
              question,
              method: text("method"),
              participants: text("participants"),
              activities,
              durationDays: typeof args.durationDays === "number" ? args.durationDays : undefined,
              metric: text("metric"),
              successCriterion: text("successCriterion"),
              rejectionCriterion: text("rejectionCriterion"),
              evidencePlan: text("evidencePlan"),
              risks: text("risks"),
            },
          }),
        ],
      };
    }

    case "propose_goals": {
      const goals = (args.goals as Array<Record<string, unknown>>) || [];
      const proposals: AiProposalItem[] = goals.map((g) =>
        makeProposal({
          type: "goal",
          title: String(g.title || "Nuevo objetivo"),
          description: String(g.description || (g.priority ? `Prioridad: ${g.priority}` : "")),
          needsHumanApproval: true,
          metadata: { priority: g.priority, kind: g.kind, baseline: g.baseline, targetResult: g.targetResult },
        }),
      );

      return {
        ok: true,
        toolName,
        summary: `Se propusieron ${proposals.length} objetivos para el plan de trabajo (Workflow RAX-07).`,
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
      const params = parseStepParams({ action: "evaluate_cycle", text: summary, decision: args.decision, autonomy: args.autonomy, nextCycleFocus: args.nextCycleFocus })!;

      return {
        ok: true,
        toolName,
        summary: `Evaluación del ciclo preparada (${achieved}/${total} objetivos logrados). Se registra cuando la persona la aplica (Workflow RAX-14).`,
        proposals: [
          makeProposal({
            type: "flow_action",
            title: `${stepActionTitle(params)} (${achieved}/${total} objetivos)`,
            description: summary,
            metadata: { ...params },
          }),
        ],
      };
    }

    case "propose_step_action": {
      const params = parseStepParams(args);
      if (!params) return { ok: false, toolName, summary: "Acción desconocida: elige una de la lista de propose_step_action.", proposals: [] };
      const rel = await relationOf(d, projectId);
      const permission = STEP_ACTIONS[params.action].permission;
      if (!can(d.actor, permission, rel)) {
        return {
          ok: false,
          toolName,
          summary: `No propuesto: «${STEP_ACTIONS[params.action].label}» no lo puede hacer quien conversa (${permission}). Explícale a quién le corresponde y cómo pedírselo.`,
          proposals: [],
        };
      }
      const title = stepActionTitle(params);
      return {
        ok: true,
        toolName,
        summary: `Paso propuesto: ${title}. Se da cuando la persona aplica la tarjeta.`,
        proposals: [makeProposal({ type: "flow_action", title, description: params.text?.slice(0, 600), metadata: { ...params } })],
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
