import type {
  AuditEvent,
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
  RoadmapMilestone,
  Task,
  MentorResource,
  MentorIntervention,
  CycleEvaluation,
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
}

/** Tablas con clave compuesta se exponen con un id sintético. */
export type ProjectMemberRow = ProjectMember & { id: string };

export interface Repository {
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
}
