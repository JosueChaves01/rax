import type { IntakeQuestion, MentorDocumentKind } from "@/types/b2b";

export interface TonePreset {
  id: string;
  label: string;
  description: string;
  emoji: string;
  text: string;
}

export const TONE_PRESETS: TonePreset[] = [
  {
    id: "socratic",
    label: "Socrático y reflexivo",
    description: "Desafía supuestos amablemente y ayuda a pensar con preguntas profundas.",
    emoji: "🧠",
    text: "Socrático, empático y desafiante. No des respuestas masticadas de inmediato; formula repreguntas profundas que ayuden al emprendedor a cuestionar sus propios supuestos y encontrar claridad.",
  },
  {
    id: "practical",
    label: "Práctico y directo",
    description: "Enfocado en ejecución ágil, accionables claros y sin rodeos.",
    emoji: "⚡",
    text: "Práctico, directo y orientado a la acción. Sé claro, conciso y aterriza cada tema en tareas ejecutables y experimentos concretos para la semana.",
  },
  {
    id: "structured",
    label: "Estructurado y analítico",
    description: "Riguroso con números, marcos de trabajo, hipótesis y métricas de avance.",
    emoji: "📐",
    text: "Estructurado, analítico y riguroso. Guíate siempre por métricas cuantificables, marcos metodológicos comprobados y evidencia empírica.",
  },
  {
    id: "supportive",
    label: "Cálido y facilitador",
    description: "Cercano, motivador, empático con el estrés del fundador y constructivo.",
    emoji: "🤝",
    text: "Cálido, cercano y facilitador. Reconoce los desafíos del camino emprendedor, valida el esfuerzo y ofrece retroalimentación constructiva y motivadora.",
  },
];

export const POPULAR_FOCUS_AREAS: string[] = [
  "Ventas B2B",
  "Product-Market Fit",
  "Finanzas & Unit Economics",
  "Go-To-Market",
  "Liderazgo & Equipo",
  "Operaciones & Procesos",
  "Levantamiento de Capital",
  "Retención & Churn",
  "Validación de Clientes",
  "Estrategia de Precios",
];

export const DEFAULT_RECOMMENDED_QUESTIONS: Array<Omit<IntakeQuestion, "id">> = [
  {
    topic: "Contexto",
    question: "¿A qué se dedica tu proyecto actualmente y cuál es la propuesta de valor principal?",
    why: "Ubicar el estado actual de la empresa antes de la primera sesión.",
    required: true,
  },
  {
    topic: "Objetivo de la mentoría",
    question: "¿Qué resultado específico te gustaría haber alcanzado al concluir este ciclo de acompañamiento?",
    why: "Alinear expectativas y definir metas de éxito claras.",
    required: true,
  },
  {
    topic: "Obstáculo principal",
    question: "¿Cuál es el principal cuello de botella o desafío que te está frenando hoy?",
    why: "Priorizar los temas más urgentes en la agenda de la Sesión 1.",
    required: true,
  },
  {
    topic: "Capacidad y recursos",
    question: "¿Cuánto tiempo y qué equipo tienes disponible para ejecutar los acuerdos entre sesiones?",
    why: "Dimensionar compromisos y metas realistas.",
    required: false,
  },
  {
    topic: "Métricas actuales",
    question: "¿Qué métricas o indicadores clave estás siguiendo hoy (ventas, usuarios, conversión)?",
    why: "Entender el grado de madurez analítica y el volumen del negocio.",
    required: false,
  },
];

export const KIND_CONFIG: Record<
  MentorDocumentKind,
  { label: string; description: string; badgeColor: string; bg: string; icon: string }
> = {
  methodology: {
    label: "Metodología",
    description: "Marcos conceptuales, pasos y principios de acompañamiento.",
    badgeColor: "text-blue-700 border-blue-200 bg-blue-50",
    bg: "bg-blue-500/10",
    icon: "book",
  },
  template: {
    label: "Plantilla",
    description: "Formatos, hojas de cálculo y estructuras de trabajo.",
    badgeColor: "text-emerald-700 border-emerald-200 bg-emerald-50",
    bg: "bg-emerald-500/10",
    icon: "template",
  },
  reference: {
    label: "Referencia",
    description: "Artículos, benchmark, normativas y material de consulta.",
    badgeColor: "text-indigo-700 border-indigo-200 bg-indigo-50",
    bg: "bg-indigo-500/10",
    icon: "reference",
  },
  example: {
    label: "Ejemplo",
    description: "Casos de estudio, respuestas modelo y buenas prácticas.",
    badgeColor: "text-amber-700 border-amber-200 bg-amber-50",
    bg: "bg-amber-500/10",
    icon: "example",
  },
};
