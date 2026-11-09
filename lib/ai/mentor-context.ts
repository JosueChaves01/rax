import type { Id } from "@/types/domain";
import type { MentorContext, MentorDocumentKind } from "@/types/b2b";
import type { Repository } from "@/lib/data/repository";
import { loadMentorProfile } from "@/lib/services/mentor-profile";
import { getMentorKnowledgeContext } from "@/lib/services/mentor-knowledge";

/**
 * Bloque `<mentor_context>` del prompt (perfil + metodología + fragmentos del RAG del mentor).
 * Lo arma Dev A; Dev B lo inserta en el prompt del entrevistador y del asistente del cliente.
 * Recibe un repositorio del sistema: quien llama ya verificó el permiso.
 *
 * Si el mentor no configuró nada (perfil vacío y sin documentos) devuelve `text: ""`: quien llama
 * puede omitir el bloque.
 */

/** Más chico que el umbral del proyecto: el bloque comparte el prompt con la guía y la conversación. */
export const MENTOR_CONTEXT_IN_CONTEXT_TOKENS = 6000;
export const MENTOR_CONTEXT_MAX_CHUNKS = 6;

const KIND_LABEL: Record<MentorDocumentKind, string> = {
  methodology: "metodología",
  template: "plantilla",
  reference: "referencia",
  example: "ejemplo",
};

const attr = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/"/g, "'");

export async function buildMentorContext(repo: Repository, mentorId: Id, query: string): Promise<MentorContext> {
  const [profile, person, knowledge] = await Promise.all([
    loadMentorProfile(repo, mentorId),
    repo.profiles.get(mentorId).catch(() => undefined),
    getMentorKnowledgeContext(repo, mentorId, query, {
      threshold: MENTOR_CONTEXT_IN_CONTEXT_TOKENS,
      maxRagChunks: MENTOR_CONTEXT_MAX_CHUNKS,
    }),
  ]);

  const sections: string[] = [];
  if (person?.name) sections.push(`Mentor: ${person.name}`);
  if (profile.headline) sections.push(`Titular: ${profile.headline}`);
  if (profile.bio) sections.push(`Biografía:\n${profile.bio}`);
  if (profile.methodology) sections.push(`Metodología:\n${profile.methodology}`);
  if (profile.focusAreas.length) sections.push(`Áreas de foco: ${profile.focusAreas.join(", ")}`);
  if (profile.assistantTone) sections.push(`Tono que pide el mentor: ${profile.assistantTone}`);

  const docs: string[] = [];
  if (knowledge.mode === "in_context") {
    for (const doc of knowledge.inContextDocs ?? []) {
      docs.push(`<document title="${attr(doc.title)}" kind="${KIND_LABEL[doc.kind] ?? doc.kind}" file="${attr(doc.filename)}">\n${doc.content}\n</document>`);
    }
  } else {
    for (const { chunk, document } of knowledge.retrievedChunks ?? []) {
      docs.push(
        `<fragment title="${attr(document.title)}" kind="${KIND_LABEL[document.kind] ?? document.kind}" file="${attr(document.filename)}" chunk="${chunk.chunkIndex}">\n${chunk.content}\n</fragment>`,
      );
    }
  }

  const hasProfile = sections.length > (person?.name ? 1 : 0);
  if (!hasProfile && docs.length === 0) return { text: "", citations: [] };

  if (docs.length) {
    const how = knowledge.mode === "in_context" ? "documentos completos" : "fragmentos más relevantes para la consulta";
    sections.push(`Material del mentor (${how}). Cítalo por su título cuando lo uses:\n<mentor_documents mode="${knowledge.mode}">\n${docs.join("\n")}\n</mentor_documents>`);
  }

  return {
    text: `<mentor_context>\n${sections.join("\n\n")}\n</mentor_context>`,
    citations: knowledge.citations,
  };
}
