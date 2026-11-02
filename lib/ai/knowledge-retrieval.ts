import "server-only";
import type { Repository } from "@/lib/data/repository";
import type { KnowledgeCitation, ProjectDocumentChunk, ProjectKnowledgeDocument } from "@/types/domain";
import { DEFAULT_IN_CONTEXT_TOKEN_LIMIT, evaluateKnowledgeMode, type KnowledgeMode } from "./token-counter";

export interface KnowledgeContextResult {
  mode: KnowledgeMode;
  totalTokens: number;
  inContextDocs?: ProjectKnowledgeDocument[];
  retrievedChunks?: Array<{
    chunk: ProjectDocumentChunk;
    document: ProjectKnowledgeDocument;
    score: number;
  }>;
  citations: KnowledgeCitation[];
}

/**
 * Motor híbrido de recuperación de conocimiento:
 * - Modo In-Context: Si caben en el límite, inyecta todos los documentos íntegros.
 * - Modo RAG Automático: Si superan el límite, indexa y recupera los fragmentos más relevantes.
 */
export async function getProjectKnowledgeContext(
  repo: Repository,
  projectId: string,
  userQuery: string,
  options: { threshold?: number; maxRagChunks?: number } = {},
): Promise<KnowledgeContextResult> {
  const threshold = options.threshold ?? DEFAULT_IN_CONTEXT_TOKEN_LIMIT;
  const maxRagChunks = options.maxRagChunks ?? 8;

  // Un documento eliminado queda con contenido vacío: no se usa como contexto.
  const documents = (await repo.projectDocuments.list({ projectId })).filter((doc) => doc.content !== "");
  if (documents.length === 0) {
    return {
      mode: "in_context",
      totalTokens: 0,
      inContextDocs: [],
      citations: [],
    };
  }

  const totalTokens = documents.reduce((sum, doc) => sum + (doc.tokenCount || 0), 0);
  const evaluation = evaluateKnowledgeMode(totalTokens, threshold);

  if (evaluation.mode === "in_context") {
    const citations: KnowledgeCitation[] = documents.map((doc) => ({
      documentId: doc.id,
      filename: doc.filename,
      title: doc.title,
      snippet: doc.content.slice(0, 150).replace(/\s+/g, " ") + "...",
    }));

    return {
      mode: "in_context",
      totalTokens,
      inContextDocs: documents,
      citations,
    };
  }

  // Modo RAG: primero la búsqueda de texto completo en Postgres (índice tsv). Si no encuentra nada,
  // van los fragmentos más recientes (p. ej. la última transcripción). Si la base todavía no tiene la
  // función, el ranking por palabras en memoria de siempre.
  const docsById = new Map<string, ProjectKnowledgeDocument>(documents.map((d) => [d.id, d]));
  const found = await searchInDatabase(repo, projectId, userQuery, maxRagChunks, docsById);
  const selected =
    found === null
      ? await rankInMemory(repo, projectId, userQuery, maxRagChunks, docsById)
      : found.length > 0
        ? found
        : (await repo.projectDocumentChunks.latest({ projectId }, maxRagChunks * 2))
            .filter((chunk) => docsById.has(chunk.documentId))
            .slice(0, maxRagChunks)
            .map((chunk) => ({ chunk, document: docsById.get(chunk.documentId)!, score: 0 }));

  const citations: KnowledgeCitation[] = selected.map((item) => ({
    documentId: item.document.id,
    filename: item.document.filename,
    title: item.document.title,
    chunkIndex: item.chunk.chunkIndex,
    snippet: item.chunk.content.slice(0, 160).replace(/\s+/g, " ") + "...",
  }));

  return {
    mode: "rag",
    totalTokens,
    retrievedChunks: selected,
    citations,
  };
}

type RetrievedChunk = NonNullable<KnowledgeContextResult["retrievedChunks"]>[number];

async function searchInDatabase(
  repo: Repository,
  projectId: string,
  userQuery: string,
  limit: number,
  docsById: Map<string, ProjectKnowledgeDocument>,
): Promise<RetrievedChunk[] | null> {
  if (!repo.fn.searchChunks) return null;
  try {
    const found = (await repo.fn.searchChunks(projectId, userQuery, limit)).filter((r) => docsById.has(r.chunk.documentId));
    return found.map((r) => ({ chunk: r.chunk, document: docsById.get(r.chunk.documentId)!, score: r.score }));
  } catch (e) {
    console.warn("[knowledge] Búsqueda en la base no disponible; se usa la búsqueda en memoria:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function rankInMemory(
  repo: Repository,
  projectId: string,
  userQuery: string,
  maxRagChunks: number,
  docsById: Map<string, ProjectKnowledgeDocument>,
): Promise<RetrievedChunk[]> {
  const allChunks = (await repo.projectDocumentChunks.list({ projectId })).filter((chunk) => docsById.has(chunk.documentId));

  // Tokenizar términos de consulta para ranking híbrido
  const queryTerms = userQuery
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scoredChunks = allChunks.map((chunk) => {
    const doc = docsById.get(chunk.documentId)!;
    let score = 0;
    const chunkText = chunk.content.toLowerCase();
    const docTitle = doc.title.toLowerCase();
    const filename = doc.filename.toLowerCase();

    for (const term of queryTerms) {
      // Coincidencia en título o nombre de archivo pondera más
      if (filename.includes(term) || docTitle.includes(term)) {
        score += 3.0;
      }
      // Frecuencia de término en el fragmento
      const matches = chunkText.split(term).length - 1;
      if (matches > 0) {
        score += Math.min(matches, 5) * 1.0;
      }
    }

    return { chunk, document: doc, score };
  });

  // Ordenar por score descendente y seleccionar Top-K con score positivo (o los primeros si ninguno coincide)
  scoredChunks.sort((a, b) => b.score - a.score);
  const relevant = scoredChunks.filter((c) => c.score > 0);
  return (relevant.length > 0 ? relevant : scoredChunks).slice(0, maxRagChunks);
}
