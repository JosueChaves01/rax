import type {
  AuditEvent,
  AgentMessage,
  AgentThread,
  Comment,
  Conversation,
  Diagnosis,
  DiagnosisItem,
  DiagnosisItemHistory,
  Evidence,
  Experiment,
  ExperimentResult,
  Hypothesis,
  MentorAssignment,
  MentorshipAgreement,
  MentorshipGoal,
  MentorshipRelation,
  MentorSession,
  Message,
  Profile,
  Project,
  SessionNote,
  RoadmapMilestone,
  Task,
  MentorResource,
  MentorIntervention,
  CycleEvaluation,
  ProjectKnowledgeDocument,
  ProjectDocumentChunk,
} from "@/types/domain";
import { conflict, notFound } from "@/lib/errors";
import type { Db, Row } from "./db";
import type { ProjectMemberRow, Repository, Table } from "./repository";

/**
 * Repositorio sobre Postgres/Supabase. Traduce el modelo de dominio (camelCase, campos compuestos,
 * "ai" como autor) a columnas (snake_case, null = IA). Ver docs/architecture.md §Persistencia.
 */

type Conv = { to: (v: unknown) => unknown; from: (v: unknown) => unknown };
const same: Conv = { to: (v) => v, from: (v) => v };
const nul: Conv = { to: (v) => (v === undefined ? null : v), from: (v) => (v === null ? undefined : v) };
const ts: Conv = { to: (v) => (v === undefined ? null : v), from: (v) => (v === null || v === undefined ? undefined : new Date(v as string).toISOString()) };
const tsReq: Conv = { to: (v) => v, from: (v) => new Date(v as string).toISOString() };
const date: Conv = {
  to: (v) => (v ? String(v).slice(0, 10) : null),
  from: (v) => (v === null || v === undefined ? undefined : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)),
};
const num: Conv = { to: (v) => (v === undefined ? null : v), from: (v) => (v === null || v === undefined ? null : Number(v)) };
/** Autor "ai" (o "system") ↔ null. */
const actor: Conv = { to: (v) => (v === "ai" || v === "system" || v === undefined ? null : v), from: (v) => (v === null ? "ai" : v) };
const arr: Conv = { to: (v) => v ?? [], from: (v) => (v as unknown[] | null) ?? [] };

interface Spec<T> {
  table: string;
  /** campo de dominio → [columna, conversión] */
  fields: Partial<Record<keyof T & string, [string, Conv]>>;
  /** Campos compuestos (p. ej. `priority` ↔ 4 columnas). */
  toExtra?: (patch: Partial<T>, row: Row) => void;
  fromExtra?: (row: Row, out: Partial<T>) => void;
  /** Campos que la base de datos administra y no se escriben (versión, timestamps con trigger). */
  readOnly?: string[];
  key?: (id: string) => Row;
  idOf?: (row: Row) => string;
}

function toRow<T>(spec: Spec<T>, entity: Partial<T>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(entity)) {
    if (spec.readOnly?.includes(k)) continue;
    const f = spec.fields[k as keyof T & string];
    if (f) row[f[0]] = f[1].to(v);
  }
  spec.toExtra?.(entity, row);
  return row;
}

function fromRow<T>(spec: Spec<T>, row: Row): T {
  const out: Partial<T> = {};
  for (const [k, f] of Object.entries(spec.fields) as Array<[keyof T & string, [string, Conv]]>) {
    const v = f[1].from(row[f[0]]);
    if (v !== undefined) (out as Row)[k] = v;
  }
  spec.fromExtra?.(row, out);
  if (spec.idOf) (out as Row).id = spec.idOf(row);
  return out as T;
}

function matchOf<T>(spec: Spec<T>, where: Partial<T>): Row {
  const m: Row = {};
  for (const [k, v] of Object.entries(where)) {
    const f = spec.fields[k as keyof T & string];
    if (!f) throw new Error(`Filtro no soportado en ${spec.table}: ${k}`);
    m[f[0]] = f[1].to(v);
  }
  return m;
}

class PgTable<T extends { id: string }> implements Table<T> {
  constructor(
    private readonly db: Db,
    private readonly spec: Spec<T>,
  ) {}

  private key(id: string): Row {
    return this.spec.key ? this.spec.key(id) : { id };
  }

  async get(id: string) {
    const rows = await this.db.select(this.spec.table, this.key(id));
    return rows[0] ? fromRow(this.spec, rows[0]) : undefined;
  }

  async list(where?: Partial<T>) {
    const rows = await this.db.select(this.spec.table, where ? matchOf(this.spec, where) : {});
    return rows.map((r) => fromRow(this.spec, r));
  }

  async insert(row: T) {
    return fromRow(this.spec, await this.db.insert(this.spec.table, toRow(this.spec, row)));
  }

  async update(id: string, patch: Partial<T>, expectedVersion?: number) {
    const match = this.key(id);
    if (expectedVersion !== undefined && this.spec.fields["version" as keyof T & string]) match.version = expectedVersion;
    const values = toRow(this.spec, patch);
    const rows = Object.keys(values).length ? await this.db.update(this.spec.table, match, values) : await this.db.select(this.spec.table, match);
    if (rows[0]) return fromRow(this.spec, rows[0]);
    // Nada actualizado: o la versión cambió (conflicto) o la fila no existe / no es visible.
    if (expectedVersion !== undefined && (await this.get(id))) throw conflict();
    throw notFound();
  }
}

/* ───────────── Especificaciones por tabla ───────────── */

const profile: Spec<Profile> = {
  table: "profiles",
  fields: {
    id: ["id", same],
    name: ["name", same],
    email: ["email", same],
    role: ["role", same],
    mentorStatus: ["mentor_status", same],
    onboarding: ["onboarding", { to: (v) => v ?? {}, from: (v) => (v && Object.keys(v as object).length ? v : undefined) }],
    onboardedAt: ["onboarded_at", ts],
    createdAt: ["created_at", tsReq],
  },
};

const project: Spec<Project> = {
  table: "projects",
  fields: {
    id: ["id", same],
    ownerId: ["owner_id", same],
    name: ["name", same],
    description: ["description", same],
    nature: ["nature", same],
    status: ["status", same],
    customInstructions: ["custom_instructions", nul],
    shareConversationWithMentor: ["share_conversation_with_mentor", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
};

const member: Spec<ProjectMemberRow> = {
  table: "project_members",
  fields: { projectId: ["project_id", same], profileId: ["profile_id", same], role: ["role", same], createdAt: ["created_at", tsReq] },
  key: (id) => {
    const [project_id, profile_id] = id.split(":");
    return { project_id, profile_id };
  },
  idOf: (r) => `${r.project_id}:${r.profile_id}`,
};

const assignment: Spec<MentorAssignment> = {
  table: "mentor_assignments",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    mentorId: ["mentor_id", same],
    status: ["status", same],
    assignedBy: ["assigned_by", same],
    createdAt: ["created_at", tsReq],
    revokedAt: ["revoked_at", ts],
  },
};

const conversation: Spec<Conversation> = {
  table: "conversations",
  fields: { id: ["id", same], projectId: ["project_id", same], createdAt: ["created_at", tsReq] },
};

const message: Spec<Message> = {
  table: "messages",
  fields: {
    id: ["id", same],
    conversationId: ["conversation_id", same],
    projectId: ["project_id", same],
    author: ["author", same],
    authorId: ["author_id", nul],
    content: ["content", same],
    provider: ["provider", nul],
    dimension: ["dimension", nul],
    createdAt: ["created_at", tsReq],
  },
};

const diagnosis: Spec<Diagnosis> = {
  table: "diagnoses",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    summary: ["summary", nul],
    summaryConfirmedAt: ["summary_confirmed_at", ts],
    summaryConfirmedBy: ["summary_confirmed_by", nul],
    updatedAt: ["updated_at", tsReq],
  },
  // El estado del diagnóstico se deriva en la aplicación; no se almacena.
  fromExtra: (_r, out) => {
    out.status = "exploring";
  },
};

const item: Spec<DiagnosisItem> = {
  table: "diagnosis_items",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    category: ["category", same],
    title: ["title", same],
    content: ["content", same],
    infoType: ["info_type", same],
    reviewStatus: ["review_status", same],
    uncertainty: ["uncertainty", same],
    authorId: ["author_id", actor],
    relatedItemIds: ["related_item_ids", arr],
    evidenceIds: ["evidence_ids", arr],
    version: ["version", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["version"],
  toExtra: (e, row) => {
    if ("source" in e) {
      row.source_kind = e.source?.kind;
      row.source_ref_id = e.source?.refId ?? null;
      row.source_quote = e.source?.quote ?? null;
    }
    if ("priority" in e) {
      row.priority_rank = e.priority?.rank ?? null;
      row.priority_rationale = e.priority?.rationale ?? null;
      row.priority_set_by = e.priority?.setBy ?? null;
      row.priority_set_at = e.priority?.setAt ?? null;
    }
  },
  fromExtra: (r, out) => {
    out.source = { kind: r.source_kind as DiagnosisItem["source"]["kind"] };
    if (r.source_ref_id) out.source.refId = r.source_ref_id as string;
    if (r.source_quote) out.source.quote = r.source_quote as string;
    if (r.priority_rank !== null && r.priority_rank !== undefined) {
      out.priority = {
        rank: Number(r.priority_rank),
        rationale: r.priority_rationale as string,
        setBy: r.priority_set_by as string,
        setAt: new Date(r.priority_set_at as string).toISOString(),
      };
    }
  },
};

/** Instantánea del elemento: el trigger la guarda con columnas; la convertimos al modelo de dominio. */
const snapshot = (v: unknown): DiagnosisItemHistory["after"] | null => {
  if (!v) return null;
  const r = v as Row;
  const domain = "project_id" in r ? fromRow(item, r) : (r as unknown as DiagnosisItem);
  const { id: _i, projectId: _p, ...rest } = domain;
  void _i;
  void _p;
  return rest;
};

const history: Spec<DiagnosisItemHistory> = {
  table: "diagnosis_item_history",
  fields: {
    id: ["id", same],
    itemId: ["item_id", same],
    projectId: ["project_id", same],
    version: ["version", same],
    change: ["change", same],
    before: ["before", { to: (v) => (v ? toRow(item, v as DiagnosisItem) : null), from: snapshot }],
    after: ["after", { to: (v) => toRow(item, v as DiagnosisItem), from: snapshot }],
    actorId: ["actor_id", actor],
    reason: ["reason", nul],
    createdAt: ["created_at", tsReq],
  },
};

const comment: Spec<Comment> = {
  table: "comments",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    targetType: ["target_type", same],
    targetId: ["target_id", same],
    authorId: ["author_id", same],
    body: ["body", same],
    createdAt: ["created_at", tsReq],
  },
};

const session: Spec<MentorSession> = {
  table: "mentor_sessions",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    mentorId: ["mentor_id", same],
    kind: ["kind", same],
    status: ["status", same],
    relationId: ["relation_id", nul],
    scheduledAt: ["scheduled_at", ts],
    startedAt: ["started_at", ts],
    briefing: ["briefing", nul],
    preSessionBriefing: ["pre_session_briefing", nul],
    postSessionSynthesis: ["post_session_synthesis", nul],
    createdAt: ["created_at", tsReq],
    completedAt: ["completed_at", ts],
  },
  toExtra: (e, row) => {
    if ("decision" in e) {
      row.decision = e.decision?.value ?? null;
      row.decision_justification = e.decision?.justification ?? null;
      row.decision_hypothesis_id = e.decision?.hypothesisId ?? null;
      row.decided_at = e.decision?.decidedAt ?? null;
    }
  },
  fromExtra: (r, out) => {
    if (r.decision) {
      out.decision = {
        value: r.decision as NonNullable<MentorSession["decision"]>["value"],
        justification: r.decision_justification as string,
        decidedAt: new Date(r.decided_at as string).toISOString(),
        ...(r.decision_hypothesis_id ? { hypothesisId: r.decision_hypothesis_id as string } : {}),
      };
    }
  },
};

const note: Spec<SessionNote> = {
  table: "session_notes",
  fields: {
    id: ["id", same],
    sessionId: ["session_id", same],
    projectId: ["project_id", same],
    authorId: ["author_id", same],
    kind: ["kind", same],
    body: ["body", same],
    isPrivate: ["is_private", { to: (v) => v === true, from: (v) => v === true }],
    relatedItemId: ["related_item_id", nul],
    createdAt: ["created_at", tsReq],
  },
};

const hypothesis: Spec<Hypothesis> = {
  table: "hypotheses",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    statement: ["statement", same],
    relatedItemId: ["related_item_id", nul],
    segment: ["segment", same],
    whyItMatters: ["why_it_matters", same],
    currentEvidence: ["current_evidence", same],
    uncertainty: ["uncertainty", same],
    costOfBeingWrong: ["cost_of_being_wrong", same],
    evaluationCriterion: ["evaluation_criterion", same],
    status: ["status", same],
    proposedBy: ["proposed_by", actor],
    approvedBy: ["approved_by", nul],
    supersededBy: ["superseded_by", nul],
    version: ["version", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["version"],
};

const experiment: Spec<Experiment> = {
  table: "experiments",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    hypothesisId: ["hypothesis_id", same],
    question: ["question", same],
    method: ["method", same],
    participants: ["participants", same],
    activities: ["activities", arr],
    resources: ["resources", same],
    budget: ["budget", num],
    durationDays: ["duration_days", num],
    metric: ["metric", same],
    successCriterion: ["success_criterion", same],
    rejectionCriterion: ["rejection_criterion", same],
    risks: ["risks", same],
    ownerId: ["owner_id", same],
    reviewDate: ["review_date", date],
    evidencePlan: ["evidence_plan", same],
    status: ["status", same],
    criteriaLockedAt: ["criteria_locked_at", ts],
    version: ["version", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["version"],
};

const result: Spec<ExperimentResult> = {
  table: "experiment_results",
  fields: {
    id: ["id", same],
    experimentId: ["experiment_id", same],
    projectId: ["project_id", same],
    outcome: ["outcome", same],
    observed: ["observed", same],
    metricValue: ["metric_value", same],
    learnings: ["learnings", same],
    limitations: ["limitations", same],
    evidenceIds: ["evidence_ids", arr],
    recordedBy: ["recorded_by", same],
    createdAt: ["created_at", tsReq],
  },
};

const task: Spec<Task> = {
  table: "tasks",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    title: ["title", same],
    actionType: ["action_type", nul],
    milestoneId: ["milestone_id", nul],
    goalId: ["goal_id", nul],
    experimentId: ["experiment_id", nul],
    assigneeId: ["assignee_id", same],
    blockedReason: ["blocked_reason", nul],
    delayHypothesis: ["delay_hypothesis", nul],
    evidenceIds: ["evidence_ids", arr],
    status: ["status", same],
    dueDate: ["due_date", date],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
};

const evidence: Spec<Evidence> = {
  table: "evidence",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    kind: ["kind", same],
    title: ["title", same],
    description: ["description", same],
    url: ["url", nul],
    uploadedBy: ["uploaded_by", same],
    createdAt: ["created_at", tsReq],
  },
  toExtra: (e, row) => {
    if ("file" in e) {
      row.file_name = e.file?.name ?? null;
      row.file_mime_type = e.file?.mimeType ?? null;
      row.file_size_bytes = e.file?.sizeBytes ?? null;
      row.storage_path = e.file?.storagePath ?? null;
    }
  },
  fromExtra: (r, out) => {
    if (r.file_name) {
      out.file = {
        name: r.file_name as string,
        mimeType: r.file_mime_type as string,
        sizeBytes: Number(r.file_size_bytes),
        ...(r.storage_path ? { storagePath: r.storage_path as string } : {}),
      };
    }
  },
};

const auditSpec: Spec<AuditEvent> = {
  table: "audit_events",
  fields: {
    id: ["id", same],
    projectId: ["project_id", nul],
    action: ["action", same],
    targetId: ["target_id", nul],
    meta: ["meta", { to: (v) => v ?? {}, from: (v) => (v && Object.keys(v as object).length ? v : undefined) }],
    createdAt: ["created_at", tsReq],
  },
  toExtra: (e, row) => {
    if ("actorId" in e) {
      const kind = e.actorId === "ai" ? "ai" : e.actorId === "system" ? "system" : "person";
      row.actor_kind = kind;
      row.actor_id = kind === "person" ? e.actorId : null;
    }
  },
  fromExtra: (r, out) => {
    out.actorId = r.actor_kind === "person" ? (r.actor_id as string) : (r.actor_kind as "ai" | "system");
  },
};

/**
 * El historial lo escribe un trigger en cada cambio (también si alguien llama directo a la API).
 * El servidor solo precisa en esa fila el tipo de cambio, el actor real (p. ej. la IA) y el motivo.
 */
const mentorshipRelationSpec: Spec<MentorshipRelation> = {
  table: "mentorship_relations",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    entrepreneurId: ["entrepreneur_id", same],
    mentorId: ["mentor_id", same],
    stage: ["stage", same],
    compatibilityStatus: ["compatibility_status", same],
    compatibilityRationale: ["compatibility_rationale", nul],
    compatibilityDecidedAt: ["compatibility_decided_at", ts],
    version: ["version", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["version", "updatedAt"],
};

const mentorshipAgreementSpec: Spec<MentorshipAgreement> = {
  table: "mentorship_agreements",
  fields: {
    id: ["id", same],
    relationId: ["relation_id", same],
    version: ["version", same],
    frequency: ["frequency", same],
    sessionDurationMinutes: ["session_duration_minutes", same],
    authorizedChannels: ["authorized_channels", arr],
    scope: ["scope", same],
    mentorCommitments: ["mentor_commitments", same],
    entrepreneurCommitments: ["entrepreneur_commitments", same],
    confidentialityTerms: ["confidentiality_terms", same],
    expectedDurationWeeks: ["expected_duration_weeks", same],
    status: ["status", same],
    confirmedAt: ["confirmed_at", ts],
    createdAt: ["created_at", tsReq],
  },
};

const mentorshipGoalSpec: Spec<MentorshipGoal> = {
  table: "mentorship_goals",
  fields: {
    id: ["id", same],
    relationId: ["relation_id", same],
    title: ["title", same],
    description: ["description", same],
    whyItMatters: ["why_it_matters", same],
    kind: ["kind", same],
    baseline: ["baseline", same],
    targetResult: ["target_result", same],
    metricIndicator: ["metric_indicator", nul],
    targetDate: ["target_date", date],
    priority: ["priority", same],
    relatedDiagnosisItemIds: ["related_diagnosis_item_ids", arr],
    status: ["status", same],
    version: ["version", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["version", "updatedAt"],
};

const roadmapMilestoneSpec: Spec<RoadmapMilestone> = {
  table: "roadmap_milestones",
  fields: {
    id: ["id", same],
    projectId: ["project_id", same],
    relationId: ["relation_id", nul],
    goalId: ["goal_id", nul],
    title: ["title", same],
    description: ["description", nul],
    targetDate: ["target_date", date],
    status: ["status", same],
    orderIndex: ["order_index", num],
    version: ["version", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["version", "updatedAt"],
};


const mentorResourceSpec: Spec<MentorResource> = {
  table: "mentor_resources",
  fields: {
    id: ["id", same],
    title: ["title", same],
    category: ["category", same],
    description: ["description", same],
    content: ["content", same],
    tags: ["tags", arr],
    authorMentorId: ["author_mentor_id", nul],
    isPublic: ["is_public", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["updatedAt"],
};

const mentorInterventionSpec: Spec<MentorIntervention> = {
  table: "mentor_interventions",
  fields: {
    id: ["id", same],
    mentorId: ["mentor_id", same],
    relationId: ["relation_id", same],
    projectId: ["project_id", same],
    projectName: ["project_name", same],
    urgency: ["urgency", same],
    category: ["category", same],
    title: ["title", same],
    explanation: ["explanation", nul],
    status: ["status", same],
    createdAt: ["created_at", tsReq],
    updatedAt: ["updated_at", tsReq],
  },
  readOnly: ["updatedAt"],
};

const cycleEvaluationSpec: Spec<CycleEvaluation> = {
  table: "cycle_evaluations",
  fields: {
    id: ["id", same],
    relationId: ["relation_id", same],
    projectId: ["project_id", same],
    cycleNumber: ["cycle_number", num],
    evaluatedAt: ["evaluated_at", tsReq],
    evaluatedBy: ["evaluated_by", same],
    goalEvaluations: ["goal_evaluations", arr],
    autonomyAssessment: ["autonomy_assessment", nul],
    mentorFeedback: ["mentor_feedback", same],
    entrepreneurFeedback: ["entrepreneur_feedback", nul],
    decision: ["decision", same],
    nextCycleFocus: ["next_cycle_focus", nul],
    version: ["version", same],
    createdAt: ["created_at", tsReq],
  },
  readOnly: ["version"],
};

const agentThreadSpec: Spec<AgentThread> = {
  table: "agent_threads",
  fields: {
    id: ["id", same], projectId: ["project_id", same], creatorId: ["creator_id", same],
    title: ["title", same], isPinned: ["is_pinned", same],
    status: ["status", same], lastErrorCode: ["last_error_code", nul], lastErrorMessage: ["last_error_message", nul],
    memory: ["memory", nul],
    createdAt: ["created_at", tsReq], updatedAt: ["updated_at", tsReq],
  },
};

const agentMessageSpec: Spec<AgentMessage> = {
  table: "agent_messages",
  fields: {
    id: ["id", same], threadId: ["thread_id", same], projectId: ["project_id", same], author: ["author", same],
    authorId: ["author_id", same], content: ["content", same], proposals: ["proposals", arr],
    artifacts: ["artifacts", arr], citations: ["citations", arr], status: ["status", same],
    errorCode: ["error_code", nul], errorMessage: ["error_message", nul], createdAt: ["created_at", tsReq],
  },
};

const projectDocumentSpec: Spec<ProjectKnowledgeDocument> = {
  table: "project_documents",
  fields: {
    id: ["id", same], projectId: ["project_id", same], title: ["title", same], filename: ["filename", same],
    content: ["content", same], fileType: ["file_type", same], tokenCount: ["token_count", same],
    source: ["source", same], sourceMessageId: ["source_message_id", nul], createdBy: ["created_by", same],
    createdAt: ["created_at", tsReq], updatedAt: ["updated_at", tsReq],
  },
};

const projectDocumentChunkSpec: Spec<ProjectDocumentChunk> = {
  table: "project_document_chunks",
  fields: {
    id: ["id", same], projectId: ["project_id", same], documentId: ["document_id", same],
    chunkIndex: ["chunk_index", same], content: ["content", same], tokenCount: ["token_count", same],
    embeddingJson: ["embedding_json", nul], createdAt: ["created_at", tsReq],
  },
};

class HistoryTable extends PgTable<DiagnosisItemHistory> {
  constructor(private readonly hdb: Db) {
    super(hdb, history);
  }

  override async insert(row: DiagnosisItemHistory) {
    const patch: Row = { change: row.change, actor_id: actor.to(row.actorId), reason: row.reason ?? null };
    const updated = await this.hdb.update(history.table, { item_id: row.itemId, version: row.version }, patch);
    if (updated[0]) return fromRow(history, updated[0]);
    return super.insert(row);
  }
}

export function createPgRepository(db: Db): Repository {
  return {
    agentThreads: new PgTable(db, agentThreadSpec),
    agentMessages: new PgTable(db, agentMessageSpec),
    profiles: new PgTable(db, profile),
    projects: new PgTable(db, project),
    projectMembers: new PgTable(db, member),
    mentorAssignments: new PgTable(db, assignment),
    conversations: new PgTable(db, conversation),
    messages: new PgTable(db, message),
    diagnoses: new PgTable(db, diagnosis),
    diagnosisItems: new PgTable(db, item),
    diagnosisItemHistory: new HistoryTable(db),
    comments: new PgTable(db, comment),
    mentorSessions: new PgTable(db, session),
    sessionNotes: new PgTable(db, note),
    mentorshipRelations: new PgTable(db, mentorshipRelationSpec),
    mentorshipAgreements: new PgTable(db, mentorshipAgreementSpec),
    mentorshipGoals: new PgTable(db, mentorshipGoalSpec),
    hypotheses: new PgTable(db, hypothesis),
    experiments: new PgTable(db, experiment),
    experimentResults: new PgTable(db, result),
    roadmapMilestones: new PgTable(db, roadmapMilestoneSpec),
    tasks: new PgTable(db, task),
    evidence: new PgTable(db, evidence),
    auditEvents: new PgTable(db, auditSpec),
    mentorResources: new PgTable(db, mentorResourceSpec),
    mentorInterventions: new PgTable(db, mentorInterventionSpec),
    cycleEvaluations: new PgTable(db, cycleEvaluationSpec),
    projectDocuments: new PgTable(db, projectDocumentSpec),
    projectDocumentChunks: new PgTable(db, projectDocumentChunkSpec),
  };
}
