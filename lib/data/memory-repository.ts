import { conflict, notFound } from "@/lib/errors";
import type { Repository, Table } from "./repository";
import { DEFAULT_MENTOR_RESOURCES } from "@/lib/resources/defaults";
import type { MentorResource } from "@/types/domain";

/**
 * Implementación en memoria del repositorio. Se usa en las pruebas.
 * Devuelve copias para que nadie mute el estado almacenado por referencia.
 */
class MemoryTable<T extends { id: string }> implements Table<T> {
  private rows = new Map<string, T>();

  async get(id: string) {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : undefined;
  }

  async list(where?: Partial<T>) {
    const all = [...this.rows.values()];
    const filtered = where
      ? all.filter((r) => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
      : all;
    return filtered.map((r) => structuredClone(r));
  }

  async insert(row: T) {
    this.rows.set(row.id, structuredClone(row));
    return structuredClone(row);
  }

  async update(id: string, patch: Partial<T>, expectedVersion?: number) {
    const current = this.rows.get(id);
    if (!current) throw notFound();
    const currentVersion = (current as { version?: number }).version;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) throw conflict();
    const next = { ...current, ...patch, id } as T;
    if (currentVersion !== undefined && expectedVersion !== undefined) {
      (next as { version?: number }).version = currentVersion + 1;
    }
    this.rows.set(id, structuredClone(next));
    return structuredClone(next);
  }
}

export function createMemoryRepository(): Repository {
  return {
    agentThreads: new MemoryTable(),
    agentMessages: new MemoryTable(),
    profiles: new MemoryTable(),
    projects: new MemoryTable(),
    projectMembers: new MemoryTable(),
    mentorAssignments: new MemoryTable(),
    conversations: new MemoryTable(),
    messages: new MemoryTable(),
    diagnoses: new MemoryTable(),
    diagnosisItems: new MemoryTable(),
    diagnosisItemHistory: new MemoryTable(),
    comments: new MemoryTable(),
    mentorSessions: new MemoryTable(),
    sessionNotes: new MemoryTable(),
    mentorshipRelations: new MemoryTable(),
    mentorshipAgreements: new MemoryTable(),
    mentorshipGoals: new MemoryTable(),
    hypotheses: new MemoryTable(),
    experiments: new MemoryTable(),
    experimentResults: new MemoryTable(),
    roadmapMilestones: new MemoryTable(),
    tasks: new MemoryTable(),
    evidence: new MemoryTable(),
    auditEvents: new MemoryTable(),
    mentorResources: (() => {
      const t = new MemoryTable<MentorResource>();
      for (const r of DEFAULT_MENTOR_RESOURCES) void t.insert(r);
      return t;
    })(),
    mentorInterventions: new MemoryTable(),
    cycleEvaluations: new MemoryTable(),
    projectDocuments: new MemoryTable(),
    projectDocumentChunks: new MemoryTable(),
  };
}
