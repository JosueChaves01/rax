"use server";

/**
 * Server Actions del lado del mentor (Dev A): perfil y conocimiento, proyectos e invitaciones,
 * sala de sesión y publicación. Usan `run` / `read` de ./_run y los servicios de lib/services/
 * (mentor-profile, mentor-knowledge, mentor-projects, session-room, publishing).
 * Un archivo "use server" solo exporta funciones async. Todo detrás de RAX_B2B_FLOW.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isB2BFlow } from "@/lib/flags";
import { forbidden, validation } from "@/lib/errors";
import type { Id } from "@/types/domain";
import type { MentorshipAgreement, MentorshipGoal, Task } from "@/types/domain";
import type { MentorProfile, ProjectInvitation } from "@/types/b2b";
import {
  createProjectAsMentor,
  inviteClient,
  markIntakeReviewed,
  revokeInvitation,
  setClientContext,
  type CreateProjectAsMentorInput,
} from "@/lib/services/mentor-projects";
import { completeB2BOnboarding, type OnboardingInput } from "@/lib/services/onboarding";
import { saveMentorProfile, type MentorProfileInput } from "@/lib/services/mentor-profile";
import {
  addMentorDocument,
  deleteMentorDocument,
  importMentorResourcesToKnowledge,
  listMentorDocuments,
  type MentorDocumentInput,
  type MentorDocumentSummary,
} from "@/lib/services/mentor-knowledge";
import {
  addClientCommitment,
  addKickoffGoal,
  confirmKickoffAgreement,
  getSessionRoomState,
  saveKickoffAgreement,
  saveLiveNotes,
  type ClientCommitmentInput,
  type KickoffAgreementInput,
  type KickoffGoalInput,
  type SessionRoomState,
} from "@/lib/services/session-room";
import { read, run, type ActionResult } from "./_run";

const PROFILE_PATH = "/app/mentor/perfil";
const CLIENTS_PATH = "/app/mentor";

/** Los ids llegan del navegador: se acepta solo texto corto sin espacios. */
function idOf(value: unknown): Id {
  if (typeof value !== "string" || !/^[\w-]{1,80}$/.test(value)) throw validation("Identificador inválido.");
  return value;
}

function requireFlow() {
  if (!isB2BFlow()) throw forbidden("Esta función todavía no está disponible.");
}

export async function saveMentorProfileAction(input: MentorProfileInput): Promise<ActionResult<MentorProfile>> {
  return run(
    null,
    async (d) => {
      requireFlow();
      const saved = await saveMentorProfile(d, input);
      revalidatePath(PROFILE_PATH);
      return saved;
    },
    { revalidate: false },
  );
}

export async function addMentorDocumentAction(input: MentorDocumentInput): Promise<ActionResult<MentorDocumentSummary>> {
  return run(
    null,
    async (d) => {
      requireFlow();
      const { content: _content, ...doc } = await addMentorDocument(d, input);
      void _content;
      revalidatePath(PROFILE_PATH);
      return doc;
    },
    { revalidate: false },
  );
}

export async function deleteMentorDocumentAction(id: string): Promise<ActionResult> {
  return run(
    null,
    async (d) => {
      requireFlow();
      await deleteMentorDocument(d, id);
      revalidatePath(PROFILE_PATH);
      return undefined;
    },
    { revalidate: false },
  );
}

export async function listMentorDocumentsAction(): Promise<ActionResult<MentorDocumentSummary[]>> {
  return read(async (d) => {
    requireFlow();
    return listMentorDocuments(d);
  });
}

export async function importMentorResourcesAction(): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return run(
    null,
    async (d) => {
      requireFlow();
      const result = await importMentorResourcesToKnowledge(d);
      revalidatePath(PROFILE_PATH);
      return result;
    },
    { revalidate: false },
  );
}

/* ───────────── Proyectos e invitaciones (Fase 2) ───────────── */

export async function createProjectAsMentorAction(
  input: CreateProjectAsMentorInput,
): Promise<ActionResult<{ projectId: Id; invited: number }>> {
  return run(null, async (d) => {
    requireFlow();
    const { project, invitations } = await createProjectAsMentor(d, {
      name: String(input?.name ?? ""),
      description: String(input?.description ?? ""),
      mode: input?.mode,
      clientEmails: Array.isArray(input?.clientEmails) ? input.clientEmails.map(String) : [],
    });
    revalidatePath(CLIENTS_PATH);
    return { projectId: project.id, invited: invitations.length };
  });
}

export async function inviteClientAction(projectId: string, email: string): Promise<ActionResult<{ invitation: ProjectInvitation; notified: boolean }>> {
  return run(null, async (d) => {
    requireFlow();
    const res = await inviteClient(d, idOf(projectId), String(email ?? ""));
    revalidatePath(CLIENTS_PATH);
    return res;
  });
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  return run(null, async (d) => {
    requireFlow();
    await revokeInvitation(d, idOf(invitationId));
    revalidatePath(CLIENTS_PATH);
    return undefined;
  });
}

export async function setClientContextAction(projectId: string, text: string): Promise<ActionResult> {
  const id = idOf(projectId);
  return run(id, async (d) => {
    requireFlow();
    await setClientContext(d, id, String(text ?? ""));
    return undefined;
  });
}

export async function markIntakeReviewedAction(projectId: string, clientId?: string): Promise<ActionResult> {
  const id = idOf(projectId);
  return run(id, async (d) => {
    requireFlow();
    await markIntakeReviewed(d, id, clientId ? idOf(clientId) : undefined);
    return undefined;
  });
}

/* ───────────── Bienvenida sin administración (§6.3) ───────────── */

/** «Soy mentor» → /app/mentor/perfil; «Vengo a trabajar con un mentor» → /app. */
export async function completeB2BOnboardingAction(input: OnboardingInput): Promise<ActionResult<{ home: string }>> {
  const res = await run(null, async (d) => {
    requireFlow();
    const { profile } = await completeB2BOnboarding(d, input);
    return { home: profile.role === "mentor" ? PROFILE_PATH : "/app" };
  });
  if (res.ok && res.data) redirect(res.data.home);
  return res;
}

/* ───────────── Sala de la sesión (Fase 3) ───────────── */

/** Lo que la sala necesita además de la llamada, según quién mira (mentor o cliente). */
export async function getSessionRoomStateAction(sessionId: string): Promise<ActionResult<SessionRoomState>> {
  return read(async (d) => {
    requireFlow();
    return getSessionRoomState(d, idOf(sessionId));
  });
}

/**
 * Autosave de las notas en vivo (cada ~3 s desde la sala). Sin revalidar: no cambia la página.
 * `expectedUpdatedAt` = la última marca que conoce la pestaña ("" si nunca se guardaron); si otra
 * pestaña guardó después responde `{ ok: false, code: "conflict" }`.
 */
export async function saveLiveNotesAction(sessionId: string, text: string, expectedUpdatedAt?: string): Promise<ActionResult<{ updatedAt: string }>> {
  return run(
    null,
    async (d) => {
      requireFlow();
      return saveLiveNotes(d, idOf(sessionId), String(text ?? ""), typeof expectedUpdatedAt === "string" ? expectedUpdatedAt : undefined);
    },
    { revalidate: false },
  );
}

function roomPath(sessionId: Id) {
  revalidatePath(`/app/llamada/${sessionId}`);
}

export async function saveKickoffAgreementAction(sessionId: string, input: KickoffAgreementInput): Promise<ActionResult<MentorshipAgreement>> {
  const id = idOf(sessionId);
  return run(null, async (d) => {
    requireFlow();
    const saved = await saveKickoffAgreement(d, id, {
      scope: String(input?.scope ?? ""),
      clientCommitments: String(input?.clientCommitments ?? ""),
      mentorCommitments: String(input?.mentorCommitments ?? ""),
      frequency: input?.frequency,
      sessionDurationMinutes: Number(input?.sessionDurationMinutes),
      expectedDurationWeeks: Number(input?.expectedDurationWeeks),
      confidentialityTerms: input?.confidentialityTerms ? String(input.confidentialityTerms) : undefined,
    });
    roomPath(id);
    return saved;
  });
}

export async function confirmKickoffAgreementAction(sessionId: string): Promise<ActionResult<MentorshipAgreement>> {
  const id = idOf(sessionId);
  return run(null, async (d) => {
    requireFlow();
    const confirmed = await confirmKickoffAgreement(d, id);
    roomPath(id);
    return confirmed;
  });
}

export async function addKickoffGoalAction(sessionId: string, input: KickoffGoalInput): Promise<ActionResult<MentorshipGoal>> {
  const id = idOf(sessionId);
  return run(null, async (d) => {
    requireFlow();
    const goal = await addKickoffGoal(d, id, {
      title: String(input?.title ?? ""),
      targetResult: String(input?.targetResult ?? ""),
      whyItMatters: input?.whyItMatters ? String(input.whyItMatters) : undefined,
    });
    roomPath(id);
    return goal;
  });
}

export async function addClientCommitmentAction(sessionId: string, input: ClientCommitmentInput): Promise<ActionResult<Task>> {
  const id = idOf(sessionId);
  return run(null, async (d) => {
    requireFlow();
    const task = await addClientCommitment(d, id, {
      clientId: input?.clientId ? idOf(input.clientId) : undefined,
      title: String(input?.title ?? ""),
      dueDate: input?.dueDate ? String(input.dueDate) : undefined,
    });
    roomPath(id);
    return task;
  });
}
