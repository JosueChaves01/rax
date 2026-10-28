import type { DiagnosisCategory, InterviewDimension, Message, Uncertainty } from "@/types/domain";

/**
 * Guía de cobertura de la entrevista inicial (sección 6.2 del prompt maestro).
 * Es una guía, no un cuestionario: se pregunta una dimensión a la vez y se saltan las ya cubiertas.
 */
export const DIMENSIONS: InterviewDimension[] = [
  "nature",
  "stage",
  "people",
  "origin",
  "problem",
  "evidence",
  "assumptions",
  "resources",
  "immediate_goal",
];

export const DIMENSION_QUESTION: Record<InterviewDimension, string> = {
  nature:
    "Para empezar, contame con tus palabras: ¿estás explorando una idea, diseñando una solución o ya tenés un negocio funcionando?",
  stage: "¿Qué has hecho hasta ahora? Cualquier paso cuenta, aunque sea pequeño.",
  people:
    "¿Quién usaría lo que querés construir? ¿Y quién pagaría por ello? A veces no son la misma persona.",
  origin: "¿Qué situación concreta te hizo pensar en esta idea?",
  problem: "¿Qué ocurre hoy con esas personas y qué te gustaría que fuera diferente?",
  evidence:
    "¿Qué has observado, conversado, probado o medido realmente? Si todavía nada, también es una respuesta válida.",
  assumptions: "¿Qué creés que es probable, pero todavía no confirmaste?",
  resources: "¿Con qué tiempo, presupuesto, capacidades y contactos contás hoy? ¿Qué te limita?",
  immediate_goal: "Si pudieras aclarar una sola cosa primero, ¿cuál sería?",
};

export const DIMENSION_CATEGORY: Record<InterviewDimension, DiagnosisCategory> = {
  nature: "context",
  stage: "context",
  people: "people_market",
  origin: "context",
  problem: "problem",
  evidence: "problem",
  assumptions: "risk",
  resources: "operational",
  immediate_goal: "context",
};

export const DIMENSION_TITLE: Record<InterviewDimension, string> = {
  nature: "Naturaleza de la iniciativa",
  stage: "Lo hecho hasta ahora",
  people: "Quién usa y quién paga",
  origin: "Origen de la idea",
  problem: "Problema percibido",
  evidence: "Evidencia disponible",
  assumptions: "Supuesto declarado",
  resources: "Recursos y restricciones",
  immediate_goal: "Objetivo inmediato",
};

/** Dimensiones cubiertas: aquellas cuya pregunta recibió una respuesta del emprendedor. */
export function coveredDimensions(messages: Message[]): Set<InterviewDimension> {
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const covered = new Set<InterviewDimension>();
  let pending: InterviewDimension | undefined;
  for (const m of sorted) {
    if (m.author === "assistant" && m.dimension) pending = m.dimension;
    else if (m.author === "entrepreneur" && pending) {
      covered.add(pending);
      pending = undefined;
    }
  }
  return covered;
}

export function nextDimension(covered: Set<InterviewDimension>): InterviewDimension | undefined {
  return DIMENSIONS.find((d) => !covered.has(d));
}

/** Suficiente contexto para un primer resumen: problema + personas + al menos otras dos dimensiones. */
export function hasEnoughForSummary(covered: Set<InterviewDimension>): boolean {
  return covered.has("problem") && covered.has("people") && covered.size >= 4;
}

/** Frase delimitada por bordes de palabra que reconocen acentos (\b de JS no los reconoce). */
const w = (src: string) => new RegExp(`(?<![\\p{L}])(?:${src})(?![\\p{L}])`, "iu");

const UNKNOWN_PATTERNS = [w("no s[eé]"), w("ni idea"), w("todav[ií]a no (?:lo )?(?:he |hemos )?investigu[eé]"), w("todav[ií]a no (?:lo )?(?:he |hemos )?investigado"), w("no tengo (?:presupuesto|idea|claro)"), w("desconozco"), w("no lo s[eé]")];
const ASSUMPTION_PATTERNS = [w("supongo"), w("creo que"), w("me parece"), w("no estoy segur[oa]"), w("probablemente"), w("imagino"), w("seguramente")];
const OBSERVATION_PATTERNS = [w("he visto"), w("vi que"), w("observ[eé]"), w("convers[eé] con"), w("habl[eé] con"), w("me dijeron"), w("entrevist[eé]")];
const CHANGE_PATTERNS = [w("quiero cambiar"), w("mejor dicho"), w("en realidad"), w("me equivoqu[eé]")];

/** Divide un mensaje en oraciones conservando el texto literal de cada una. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export const isUnknownSentence = (s: string) => UNKNOWN_PATTERNS.some((p) => p.test(s));

export interface StatementSignal {
  uncertainty: Uncertainty;
  kind: "unknown" | "assumption" | "observation" | "statement";
  changeOfMind: boolean;
}

/**
 * Señales lingüísticas sobre CÓMO afirma algo la persona. No interpreta el contenido:
 * "no sé" produce un estado explícito de incertidumbre, nunca un error de validación.
 */
export function readStatementSignal(text: string): StatementSignal {
  const changeOfMind = CHANGE_PATTERNS.some((p) => p.test(text));
  if (UNKNOWN_PATTERNS.some((p) => p.test(text))) return { uncertainty: "unknown", kind: "unknown", changeOfMind };
  if (ASSUMPTION_PATTERNS.some((p) => p.test(text))) return { uncertainty: "high", kind: "assumption", changeOfMind };
  if (OBSERVATION_PATTERNS.some((p) => p.test(text))) return { uncertainty: "medium", kind: "observation", changeOfMind };
  return { uncertainty: "medium", kind: "statement", changeOfMind };
}
