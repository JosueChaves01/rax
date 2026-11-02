import type {
  AuditEvent,
  AgentMessage,
  AgentSession,
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
  ProjectMember,
  SessionNote,
  SessionCall,
  SessionCallSegment,
  RoadmapMilestone,
  Task,
  MentorResource,
  MentorIntervention,
  CycleEvaluation,
  ProjectKnowledgeDocument,
  ProjectDocumentChunk,
} from "@/types/domain";

/**
 * Puerto de persistencia. Los servicios de dominio solo conocen esta interfaz:
 * la implementación en memoria (pruebas) y la de Supabase son intercambiables.
 * Los filtros son de igualdad para que se traduzcan 1:1 a `.match()` de PostgREST.
 */
export interface Table<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  list(where?: Partial<T>): Promise<T[]>;
  insert(row: T): Promise<T>;
  /**
   * Actualiza una fila. Si `expectedVersion` se indica y no coincide con la versión
   * almacenada, debe lanzar un error de conflicto (concurrencia optimista).
   */
  update(id: string, patch: Partial<T>, expectedVersion?: number): Promise<T>;
  /** Las `limit` filas más recientes por `createdAt`, de la más nueva a la más vieja. */
  latest(where: Partial<T>, limit: number): Promise<T[]>;
  /** Cuántas filas coinciden con el filtro, sin traerlas. */
  count(where: Partial<T>): Promise<number>;
}

/**
 * Funciones SQL del repositorio (RPC). Son opcionales: si la base no las tiene (migración sin aplicar)
 * o la implementación no las ofrece, quien las usa sigue con su alternativa en memoria.
 */
export interface RepositoryFunctions {
  /** Fragmentos de conocimiento del proyecto más relevantes para la consulta (búsqueda de texto completo). */
  searchChunks?(projectId: string, query: string, limit: number): Promise<Array<{ chunk: ProjectDocumentChunk; score: number }>>;
  /** Suma uso de IA de una persona en un día y devuelve el total acumulado de ese día. */
  addAiUsage?(actorId: string, kind: AiUsageKind, day: string, amount: number): Promise<number>;
}

export type AiUsageKind = "agent_message" | "audio_chunk";

/** Tablas con clave compuesta se exponen con un id sintético. */
export type ProjectMemberRow = ProjectMember & { id: string };

export interface Repository {
  agentSessions: Table<AgentSession>;
  sessionCalls: Table<SessionCall>;
  sessionCallSegments: Table<SessionCallSegment>;
  agentThreads: Table<AgentThread>;
  agentMessages: Table<AgentMessage>;
  profiles: Table<Profile>;
  projects: Table<Project>;
  projectMembers: Table<ProjectMemberRow>;
  mentorAssignments: Table<MentorAssignment>;
  conversations: Table<Conversation>;
  messages: Table<Message>;
  diagnoses: Table<Diagnosis>;
  diagnosisItems: Table<DiagnosisItem>;
  diagnosisItemHistory: Table<DiagnosisItemHistory>;
  comments: Table<Comment>;
  mentorSessions: Table<MentorSession>;
  sessionNotes: Table<SessionNote>;
  mentorshipRelations: Table<MentorshipRelation>;
  mentorshipAgreements: Table<MentorshipAgreement>;
  mentorshipGoals: Table<MentorshipGoal>;
  hypotheses: Table<Hypothesis>;
  experiments: Table<Experiment>;
  experimentResults: Table<ExperimentResult>;
  roadmapMilestones: Table<RoadmapMilestone>;
  tasks: Table<Task>;
  evidence: Table<Evidence>;
  auditEvents: Table<AuditEvent>;
  mentorResources: Table<MentorResource>;
  mentorInterventions: Table<MentorIntervention>;
  cycleEvaluations: Table<CycleEvaluation>;
  projectDocuments: Table<ProjectKnowledgeDocument>;
  projectDocumentChunks: Table<ProjectDocumentChunk>;
  fn: RepositoryFunctions;
}
