import { afterAll, describe, expect, it } from "vitest";
import { BACKEND, closeWorlds, world } from "./helpers";
import { getMentorProfile, saveMentorProfile } from "@/lib/services/mentor-profile";
import { SAMPLE_INTERVIEW_GUIDE } from "./fixtures/b2b";

afterAll(closeWorlds);

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string }) => e);

describe("perfil del mentor (Fase 1, Dev A)", () => {
  it("sin fila devuelve el perfil vacío del mentor", async () => {
    const w = await world();
    const profile = await getMentorProfile(w.as("men1"));
    expect(profile).toMatchObject({ mentorId: w.id("men1"), headline: "", methodology: "", focusAreas: [], interviewGuide: [] });
  });

  it("guarda, valida y conserva lo que no se manda", async () => {
    const w = await world();
    const men = w.as("men1");
    const first = await saveMentorProfile(men, {
      headline: "  Mentora de comercios  ",
      methodology: "Primero los números, después el cliente.",
      focusAreas: ["finanzas", " Finanzas ", "", "ventas"],
    });
    expect(first.headline).toBe("Mentora de comercios");
    expect(first.focusAreas).toEqual(["finanzas", "ventas"]);

    const second = await saveMentorProfile(men, { assistantTone: "Cercano, de tú." });
    expect(second.methodology).toBe("Primero los números, después el cliente.");
    expect(second.assistantTone).toBe("Cercano, de tú.");
    expect((await getMentorProfile(men)).assistantTone).toBe("Cercano, de tú.");

    const tooLong = await errorOf(saveMentorProfile(men, { headline: "x".repeat(201) }));
    expect(tooLong?.code).toBe("validation");
    const unknownField = await errorOf(saveMentorProfile(men, { mentorId: "otro" } as never));
    expect(unknownField?.code).toBe("validation");
  });

  it("la guía de entrevista conserva ids, asigna los que faltan y no repite", async () => {
    const w = await world();
    const men = w.as("men1");
    const saved = await saveMentorProfile(men, {
      interviewGuide: [
        SAMPLE_INTERVIEW_GUIDE[0],
        { ...SAMPLE_INTERVIEW_GUIDE[1], id: "" },
        { ...SAMPLE_INTERVIEW_GUIDE[2], id: SAMPLE_INTERVIEW_GUIDE[0].id },
      ],
    });
    const ids = saved.interviewGuide.map((q) => q.id);
    expect(ids[0]).toBe("q_negocio");
    expect(ids[1]).toBeTruthy();
    expect(new Set(ids).size).toBe(3);
    expect(saved.interviewGuide[0]).toEqual(SAMPLE_INTERVIEW_GUIDE[0]);

    const empty = await errorOf(saveMentorProfile(men, { interviewGuide: [{ id: "q", topic: "", question: "¿?", why: "", required: true }] }));
    expect(empty?.code).toBe("validation");
  });

  it("solo un mentor guarda su perfil", async () => {
    const w = await world();
    const err = await errorOf(saveMentorProfile(w.as("ent1"), { headline: "Hola" }));
    expect(err?.code).toBe("forbidden");
  });

  it.skipIf(BACKEND === "pg")("otra persona solo lee el perfil de un mentor con quien comparte proyecto", async () => {
    const w = await world();
    await saveMentorProfile(w.as("men1"), { headline: "Mentora", interviewGuide: SAMPLE_INTERVIEW_GUIDE });
    expect((await errorOf(getMentorProfile(w.as("ent1"), "men1")))?.code).toBe("not_found");
    expect((await errorOf(getMentorProfile(w.as("men2"), "men1")))?.code).toBe("not_found");

    const at = "2026-10-01T00:00:00.000Z";
    await w.repo.projects.insert({
      id: "prj_b2b", ownerId: "ent2", mentorId: "men1", name: "Panadería", description: "", nature: "operating_business",
      status: "active", shareConversationWithMentor: false, createdAt: at, updatedAt: at,
    });
    await w.repo.projectMembers.insert({ id: "prj_b2b:ent1", projectId: "prj_b2b", profileId: "ent1", role: "client", createdAt: at });
    const seen = await getMentorProfile(w.as("ent1"), "men1");
    expect(seen.headline).toBe("Mentora");
    expect(seen.interviewGuide).toHaveLength(3);
    expect((await getMentorProfile(w.as("ent2"), "men1")).headline).toBe("Mentora");
  });
});
