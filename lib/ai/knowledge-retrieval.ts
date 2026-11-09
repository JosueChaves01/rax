import "server-only";
import type { Repository } from "@/lib/data/repository";
import type { KnowledgeCitation, ProjectDocumentChunk, ProjectKnowledgeDocument } from "@/types/domain";
import { DEFAULT_IN_CONTEXT_TOKEN_LIMIT, evaluateKnowledgeMode, type KnowledgeMode } from "./token-counter";

/** Lo mínimo que el motor necesita de un documento (del proyecto o del mentor). */
export interface KnowledgeDocumentLike {
  id: string;
  title: string;
  filename: string;
  content: string;
  tokenCount: number;
}

/** Lo mínimo que el motor necesita de un fragmento indexado. */
export interface KnowledgeChunkLike {
  documentId: string;
  chunkIndex: number;
  content: string;
}

export interface KnowledgeContextResult<
  D extends KnowledgeDocumentLike = ProjectKnowledgeDocument,
  C extends KnowledgeChunkLike = ProjectDocumentChunk,
> {
  mode: KnowledgeMode;
  totalTokens: number;
  inContextDocs?: D[];
  retrievedChunks?: Array<{
    chunk: C;
    document: D;
    score: number;
  }>;
  citations: KnowledgeCitation[];
}

export interface KnowledgeOptions {
  threshold?: number;
  maxRagChunks?: number;
}

/**
 * De dónde sale el conocimiento: los documentos, sus fragmentos y, si la base la ofrece, una búsqueda
 * de texto completo. `search` devuelve `null` cuando no está disponible (se usa el ranking en memoria).
 */
export interface KnowledgeSource<D extends KnowledgeDocumentLike, C extends KnowledgeChunkLike> {
  documents(): Promise<D[]>;
  chunks(): Promise<C[]>;
  latestChunks(limit: number): Promise<C[]>;
  search?(query: string, limit: number): Promise<Array<{ chunk: C; score: number }> | null>;
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
  options: KnowledgeOptions = {},
): Promise<KnowledgeContextResult> {
  return getKnowledgeContext(
    {
      documents: () => repo.projectDocuments.list({ projectId }),
      chunks: () => repo.projectDocumentChunks.list({ projectId }),
      latestChunks: (limit) => repo.projectDocumentChunks.latest({ projectId }, limit),
      search: async (query, limit) => (repo.fn.searchChunks ? repo.fn.searchChunks(projectId, query, limit) : null),
    },
    userQuery,
    options,
  );
}

/**
 * Núcleo genérico del motor (proyecto o mentor). Un documento eliminado queda con contenido vacío:
 * no se usa como contexto.
 */
export async function getKnowledgeContext<D extends KnowledgeDocumentLike, C extends KnowledgeChunkLike>(
  source: KnowledgeSource<D, C>,
  userQuery: string,
  options: KnowledgeOptions = {},
): Promise<KnowledgeContextResult<D, C>> {
  const threshold = options.threshold ?? DEFAULT_IN_CONTEXT_TOKEN_LIMIT;
  const maxRagChunks = options.maxRagChunks ?? 8;

  const documents = (await source.documents()).filter((doc) => doc.content !== "");
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
  const docsById = new Map<string, D>(documents.map((d) => [d.id, d]));
  const found = await searchInDatabase(source, userQuery, maxRagChunks, docsById);
  const selected =
    found === null
      ? await rankInMemory(source, userQuery, maxRagChunks, docsById)
      : found.length > 0
        ? found
        : (await source.latestChunks(maxRagChunks * 2))
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

type Retrieved<D, C> = { chunk: C; document: D; score: number };

async function searchInDatabase<D extends KnowledgeDocumentLike, C extends KnowledgeChunkLike>(
  source: KnowledgeSource<D, C>,
  userQuery: string,
  limit: number,
  docsById: Map<string, D>,
): Promise<Array<Retrieved<D, C>> | null> {
  if (!source.search) return null;
  try {
    const results = await source.search(userQuery, limit);
    if (results === null) return null;
    const found = results.filter((r) => docsById.has(r.chunk.documentId));
    return found.map((r) => ({ chunk: r.chunk, document: docsById.get(r.chunk.documentId)!, score: r.score }));
  } catch (e) {
    console.warn("[knowledge] Búsqueda en la base no disponible; se usa la búsqueda en memoria:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function rankInMemory<D extends KnowledgeDocumentLike, C extends KnowledgeChunkLike>(
  source: KnowledgeSource<D, C>,
  userQuery: string,
  maxRagChunks: number,
  docsById: Map<string, D>,
): Promise<Array<Retrieved<D, C>>> {
  const allChunks = (await source.chunks()).filter((chunk) => docsById.has(chunk.documentId));

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
