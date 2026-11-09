"use server";

/**
 * Server Actions del lado del mentor (Dev A): perfil y conocimiento, proyectos e invitaciones,
 * sala de sesión y publicación. Usan `run` / `read` de ./_run y los servicios de lib/services/
 * (mentor-profile, mentor-knowledge, mentor-projects, session-room, publishing).
 * Un archivo "use server" solo exporta funciones async. Todo detrás de RAX_B2B_FLOW.
 */

import { revalidatePath } from "next/cache";
import { isB2BFlow } from "@/lib/flags";
import { forbidden } from "@/lib/errors";
import type { MentorProfile } from "@/types/b2b";
import { saveMentorProfile, type MentorProfileInput } from "@/lib/services/mentor-profile";
import {
  addMentorDocument,
  deleteMentorDocument,
  importMentorResourcesToKnowledge,
  listMentorDocuments,
  type MentorDocumentInput,
  type MentorDocumentSummary,
} from "@/lib/services/mentor-knowledge";
import { read, run, type ActionResult } from "./_run";

const PROFILE_PATH = "/app/mentor/perfil";

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
