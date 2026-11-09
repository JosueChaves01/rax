import type { Profile, Project, ProjectKnowledgeDocument } from "@/types/domain";
import type { Repository } from "@/lib/data/repository";
import type { ServiceDeps } from "@/lib/services/base";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { isDomainError } from "@/lib/errors";
import { B2B_PEOPLE } from "./b2b";

/**
 * Mundo en memoria para las pruebas de Fase 4 (Dev B): un proyecto B2B de Mara con sus personas
 * cliente, documentos publicados y «solo mentor». Personas y datos ficticios.
 */

export const AT = "2026-11-09T10:00:00.000Z";
export const [MARA, CAMI, BETO] = B2B_PEOPLE;
export const OUTSIDER: Profile = { id: "u_ximena", name: "Ximena Ajena", email: "x@demo.rax", role: "entrepreneur", mentorStatus: "none", onboardedAt: AT, createdAt: AT };
export const OTHER_MENTOR: Profile = { id: "u_otro", name: "Otro Mentor", email: "otro@demo.rax", role: "mentor", mentorStatus: "approved", onboardedAt: AT, createdAt: AT };
export const PID = "prj_panaderia";

export interface B2BWorld {
  repo: Repository;
  as: (actor: Profile) => ServiceDeps;
  doc: (id: string, patch?: Partial<ProjectKnowledgeDocument>) => Promise<ProjectKnowledgeDocument>;
}

export async function b2bWorld(mode: Project["mode"] = "individual", clients: Profile[] = [CAMI]): Promise<B2BWorld> {
  const repo = createMemoryRepository();
  let tick = 0;
  for (const p of [...B2B_PEOPLE, OUTSIDER, OTHER_MENTOR]) await repo.profiles.insert(p);
  await repo.projects.insert({
    id: PID, mentorId: MARA.id, mode, cycleStage: "cycle", name: "Panadería La Espiga", description: "Pan de barrio",
    nature: "operating_business", status: "active", shareConversationWithMentor: false, createdAt: AT, updatedAt: AT,
  } as unknown as Project);
  for (const c of clients) await repo.projectMembers.insert({ id: `${PID}:${c.id}`, projectId: PID, profileId: c.id, role: "client", createdAt: AT });
  const as = (actor: Profile): ServiceDeps => ({
    repo,
    ai: new SimulatedProvider(),
    actor,
    now: () => new Date(Date.parse(AT) + ++tick * 1000).toISOString(),
    newId: (p) => `${p}_${++tick}`,
  });
  const doc = (id: string, patch: Partial<ProjectKnowledgeDocument> = {}) =>
    repo.projectDocuments.insert({
      id, projectId: PID, title: id, filename: `${id}.md`, content: `Contenido de ${id}`, fileType: "markdown", tokenCount: 10,
      source: "upload", createdBy: MARA.id, createdAt: AT, updatedAt: AT, visibility: "mentor_only", docKind: "material", ...patch,
    });
  return { repo, as, doc };
}

export const code = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isDomainError(e) ? e.code : String(e)));
