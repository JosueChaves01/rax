import { describe, expect, it } from "vitest";
import type { Profile, Project } from "@/types/domain";
import type { ServiceDeps } from "@/lib/services/base";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { buildMentorContext } from "@/lib/ai/mentor-context";
import { addMentorDocument } from "@/lib/services/mentor-knowledge";
import { runIntakeTurn, submitIntake, getIntakeState } from "@/lib/services/intake";
import { B2B_PEOPLE, SAMPLE_INTERVIEW_GUIDE, sampleMentorDocument, sampleMentorProfile } from "./fixtures/b2b";

/**
 * Integración de Fase 1 (plan técnico §4): con un documento de metodología del mentor cargado, el
 * brief cita ese documento en `citations` y cubre las preguntas obligatorias de la guía.
 * Integrado (Fase 2): usa el `buildMentorContext` real de Dev A (lib/ai/mentor-context.ts) y el
 * documento se carga con su servicio (`addMentorDocument`, que también arma los fragmentos del RAG).
 */

const AT = "2026-11-09T10:00:00.000Z";
const [MARA, CAMI] = B2B_PEOPLE;

describe("intake con el RAG del mentor", () => {
  it("el brief cita la metodología del mentor y cubre las preguntas obligatorias de la guía", async () => {
    const repo = createMemoryRepository();
    for (const p of B2B_PEOPLE) await repo.profiles.insert(p);
    const profile = sampleMentorProfile(MARA.id);
    await repo.mentorProfiles.insert({ ...profile, id: profile.mentorId });
    const sample = sampleMentorDocument(MARA.id);
    await repo.projects.insert({
      id: "prj_panaderia", ownerId: CAMI.id, mentorId: MARA.id, mode: "individual", cycleStage: "intake", name: "Panadería La Espiga",
      description: "", nature: "operating_business", status: "active", shareConversationWithMentor: false, createdAt: AT, updatedAt: AT,
    } as Project);
    await repo.projectMembers.insert({ id: "prj_panaderia:u_cami", projectId: "prj_panaderia", profileId: CAMI.id, role: "client", createdAt: AT });

    let t = 0;
    const as = (actor: Profile): ServiceDeps => ({ repo, ai: new SimulatedProvider(), actor, now: () => new Date(Date.parse(AT) + ++t * 1000).toISOString(), newId: (p) => `${p}_${++t}` });
    const cami = as(CAMI);
    const doc = await addMentorDocument(as(MARA), { title: sample.title, filename: sample.filename, content: sample.content, fileType: sample.fileType, kind: sample.kind });

    // El contexto real del mentor ya trae su perfil, su metodología y el documento con cita.
    const ctx = await buildMentorContext(repo, MARA.id, "margen y caja del mes");
    expect(ctx.text).toContain("<mentor_context>");
    expect(ctx.text).toContain(sampleMentorProfile().methodology);
    expect(ctx.text).toContain(doc.title);
    expect(ctx.citations.map((c) => c.documentId)).toContain(doc.id);

    await runIntakeTurn(cami, "prj_panaderia", "");
    await runIntakeTurn(cami, "prj_panaderia", "Pan artesanal y repostería para las familias del barrio de San Pedro.");
    await runIntakeTurn(cami, "prj_panaderia", "Que a fin de mes no me alcanza la caja y no sé qué producto me deja margen.");
    await runIntakeTurn(cami, "prj_panaderia", "No sé");
    await submitIntake(cami, "prj_panaderia");

    const { brief } = await getIntakeState(as(MARA), "prj_panaderia");
    expect(brief).toBeDefined();
    expect(brief!.citations?.map((c) => c.documentId)).toContain(doc.id);
    expect(brief!.suggestedAgenda[0].title).toContain(doc.title);

    const required = SAMPLE_INTERVIEW_GUIDE.filter((q) => q.required).map((q) => q.id);
    const answered = new Set(brief!.answers.map((a) => a.questionId));
    for (const id of required) expect(answered.has(id), id).toBe(true);
    // La opcional que saltó queda como brecha para la Sesión 1.
    expect(brief!.gaps.some((g) => g.includes("¿Cuánto vendes en un mes normal?"))).toBe(true);
  });
});
