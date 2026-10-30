import "server-only";
import type { AgreementFrequency, InitiativeNature } from "@/types/domain";

export interface MentorshipExplorationAiResult {
  // Paso 1: Perfil de la iniciativa
  initiativeName: string;
  sector: string;
  nature: InitiativeNature;
  summary: string;

  // Paso 2: Expectativas y Diagnóstico
  motivation: "scale" | "skills" | "validate" | "network" | "blocker" | "other";
  description: string;

  // Paso 3: Compatibilidad y Matching
  compatibilityScore: number;
  compatibilityRationale: string;
  suggestedMentorName: string;
  validationGoals: string[];

  // Paso 4: Acuerdo Preliminar
  frequency: AgreementFrequency;
  sessionDurationMinutes: number;
  expectedDurationWeeks: number;
  cycleGoals: string;
  scope: string;
  mentorCommitments: string;
  entrepreneurCommitments: string;
  confidentialityTerms: string;
  authorizedChannels: string[];
}

interface Archetype {
  initiativeName: string;
  sector: string;
  nature: InitiativeNature;
  summary: string;
  motivation: "scale" | "skills" | "validate" | "network" | "blocker" | "other";
  description: string;
  compatibilityScore: number;
  compatibilityRationale: string;
  suggestedMentorName: string;
  validationGoals: string[];
  frequency: AgreementFrequency;
  sessionDurationMinutes: number;
  expectedDurationWeeks: number;
  cycleGoals: string;
  scope: string;
  mentorCommitments: string;
  entrepreneurCommitments: string;
  confidentialityTerms: string;
  authorizedChannels: string[];
}

const ARCHETYPES: Record<string, Archetype> = {
  health: {
    initiativeName: "KlinicOS",
    sector: "Salud Digital & HealthTech",
    nature: "designing_solution",
    summary: "Plataforma de gestión clínica interoperable y teleconsulta especializada para centros médicos medianos.",
    motivation: "validate",
    description: "Contamos con un prototipo funcional probado en 2 policlínicos piloto. Necesitamos estructurar el modelo de precios recurrente y validar la reducción real en ausentismo de pacientes antes del lanzamiento comercial masivo.",
    compatibilityScore: 96,
    compatibilityRationale: "Alta afinidad sectorial: El perfil del mentor combina 10+ años en operaciones sanitarias con experiencia en comercialización de software B2B para clínicas. Encaja exactamente con las dudas de pricing y regulación de datos de salud.",
    suggestedMentorName: "Mentora Asignada (Especialista HealthTech)",
    validationGoals: [
      "Comprobar disposición a pagar tarifa mensual >= $200 USD en 5 clínicas",
      "Medir reducción de ausentismo con recordatorios automatizados",
      "Validar cumplimiento con normativas de protección de datos clínicos",
    ],
    frequency: "biweekly",
    sessionDurationMinutes: 60,
    expectedDurationWeeks: 12,
    cycleGoals: "Validación de modelo de negocio B2B y cierre de los primeros 5 contratos de suscripción médica.",
    scope: "Acompañamiento en estrategia de ventas a clínicas, empaquetado de funcionalidades críticas del MVP y métricas de retención clínica.",
    mentorCommitments: "Revisar quincenalmente el embudo de ventas, aportar feedback en reuniones con directores médicos y facilitar 3 contactos clave del ecosistema de salud.",
    entrepreneurCommitments: "Ejecutar al menos 8 llamadas de validación por semana, mantener actualizadas las métricas de uso y preparar la agenda con 24h de anticipación.",
    confidentialityTerms: "Toda la información operativa, métricas de pacientes y código propietario se tratan bajo estricta confidencialidad no divulgable a terceros.",
    authorizedChannels: ["virtual", "email", "whatsapp"],
  },
  logistics: {
    initiativeName: "UrbanLogix",
    sector: "Logística y Movilidad Urbana",
    nature: "operating_business",
    summary: "Red de micro-hubs urbanos para entregas de última milla sostenibles en menos de 45 minutos.",
    motivation: "scale",
    description: "Operamos en 2 distritos con 12 mensajeros. Queremos optimizar la densidad de pedidos por ruta para alcanzar punto de equilibrio operativo y negociar alianzas con cadenas de retail locales.",
    compatibilityScore: 94,
    compatibilityRationale: "Alineación operativa directa: Mentor con trayectoria consolidada en supply chain y economía unitaria de flotas. Puede guiar la estructuración de costos marginales por entrega y convenios corporativos.",
    suggestedMentorName: "Mentor Senior en Operaciones & Supply Chain",
    validationGoals: [
      "Alcanzar 3.2 entregas por hora por mensajero",
      "Validar costo marginal por paquete inferior a $2.50 USD",
      "Firmar 2 cartas de intención con marcas de e-commerce locales",
    ],
    frequency: "weekly",
    sessionDurationMinutes: 60,
    expectedDurationWeeks: 8,
    cycleGoals: "Optimización de unit economics y consolidación de la red de micro-hubs en zona centro.",
    scope: "Revisión de rutas, estructura de incentivos para transportistas y diseño de propuesta de valor B2B para tiendas online.",
    mentorCommitments: "Asesorar en el cálculo de densidad de pedidos, auditar estructura de costos fijos/variables y orientar en negociación con retailers.",
    entrepreneurCommitments: "Monitorear diariamente métricas de puntualidad y costo por paquete, aplicando correcciones operativas sugeridas cada semana.",
    confidentialityTerms: "Confidencialidad mutua respecto a rutas, algoritmos de asignación, clientes corporativos y datos financieros.",
    authorizedChannels: ["virtual", "email", "whatsapp"],
  },
  general: {
    initiativeName: "SaaSFlow Pro",
    sector: "Software B2B & Productividad",
    nature: "exploring_idea",
    summary: "Herramienta colaborativa para sincronizar flujos de trabajo operativos entre equipos remotos sin fricción.",
    motivation: "validate",
    description: "Hemos identificado cuellos de botella severos en la coordinación de tareas entre soporte y producto. Buscamos formular hipótesis refutables sobre la disposición a pagar y diseñar un experimento de preventa antes de programar el software.",
    compatibilityScore: 95,
    compatibilityRationale: "Compatibilidad metodológica óptima: El mentor domina Lean Startup, diseño de entrevistas de problema/solución y validación ex-ante sin desperdicio de capital técnico.",
    suggestedMentorName: "Mentora Asignada (Lean & Estrategia)",
    validationGoals: [
      "Completar 15 entrevistas de descubrimiento de problema con gerentes de operaciones",
      "Identificar el dolor prioritario por el cual pagarían inmediatamente",
      "Diseñar experimento de preventa con landing page de alta conversión",
    ],
    frequency: "biweekly",
    sessionDurationMinutes: 60,
    expectedDurationWeeks: 12,
    cycleGoals: "Validar problema y disposición a pagar antes de invertir en desarrollo tecnológico.",
    scope: "Guion de entrevistas a clientes, delimitación de la propuesta de valor y fijación de criterios numéricos de éxito y descarte.",
    mentorCommitments: "Evaluar objetivamente la evidencia recolectada, desafiar supuestos no comprobados y asistir en la síntesis de aprendizajes.",
    entrepreneurCommitments: "Entrevistar clientes reales semanalmente con evidencia textual honesta, sin vender la solución de antemano.",
    confidentialityTerms: "Acuerdo estándar de confidencialidad y propiedad intelectual exclusiva del emprendedor.",
    authorizedChannels: ["virtual", "email", "whatsapp"],
  },
  learning: {
    initiativeName: "Plan de Aprendizaje y Tutoría",
    sector: "Educación, Formación & Habilidades",
    nature: "exploring_idea",
    summary: "Itinerario de aprendizaje guiado para consolidar competencias teóricas y prácticas con acompañamiento de un tutor/mentor.",
    motivation: "skills",
    description: "Proceso formativo enfocado en dominar conceptos clave, resolver dudas metodológicas y completar ejercicios prácticos con retroalimentación continua.",
    compatibilityScore: 98,
    compatibilityRationale: "Alineación pedagógica óptima: El tutor/mentor cuenta con amplia trayectoria docente y acompañamiento personalizado, facilitando la comprensión conceptual y el andamiaje del aprendizaje.",
    suggestedMentorName: "Tutor/a Académico y Metodológico",
    validationGoals: [
      "Comprender y aplicar con soltura los conceptos fundamentales del programa",
      "Completar ejercicios prácticos y autoevaluaciones con retroalimentación formativa",
      "Preparar y revisar dudas críticas en cada sesión de tutoría quincenal",
    ],
    frequency: "biweekly",
    sessionDurationMinutes: 60,
    expectedDurationWeeks: 10,
    cycleGoals: "Dominio de competencias clave y acompañamiento tutorial personalizado paso a paso.",
    scope: "Guía pedagógica, resolución de dudas conceptuales, revisión de ejercicios y diseño de planes de estudio. No incluye realización de tareas por parte del tutor ni sustitución del esfuerzo del estudiante.",
    mentorCommitments: "Revisar entregas y ejercicios previamente, brindar retroalimentación constructiva y orientar el plan de estudio con paciencia y claridad.",
    entrepreneurCommitments: "Estudiar el material asignado, anotar dudas específicas antes de cada tutoría y realizar los ejercicios de práctica propuestos.",
    confidentialityTerms: "Tratamiento respetuoso y confidencial del desempeño académico y materiales de trabajo.",
    authorizedChannels: ["virtual", "email", "whatsapp"],
  },
};

export async function generateMentorshipExplorationData(
  prompt?: string,
  preferredMentorName?: string,
): Promise<MentorshipExplorationAiResult> {
  const p = (prompt || "").toLowerCase();
  const cleanPrompt = (prompt || "").trim();

  let base: Archetype;
  if (cleanPrompt.length > 3) {
    let sector = "Tecnología e Innovación Digital";
    let archetypeBase = ARCHETYPES.general;

    if (/aprend|estudi|educa|tutor|clase|universidad|colegio|academ|habilidad/.test(p)) {
      sector = "Educación, Formación & Habilidades";
      archetypeBase = ARCHETYPES.learning;
    } else if (p.includes("salud") || p.includes("medic") || p.includes("clinic") || p.includes("doctor") || p.includes("health")) {
      sector = "Salud Digital & HealthTech";
      archetypeBase = ARCHETYPES.health;
    } else if (p.includes("logistic") || p.includes("delivery") || p.includes("repart") || p.includes("transporte") || p.includes("paquet")) {
      sector = "Logística y Movilidad Urbana";
      archetypeBase = ARCHETYPES.logistics;
    }

    const isGenericKeyword = [
      "salud",
      "salud digital",
      "clínica y salud digital",
      "clinica y salud digital",
      "health",
      "logistica",
      "logística",
      "logistica urbana",
      "logística urbana y entregas",
      "saas",
      "saas b2b",
      "aprendizaje",
      "estudio",
      "tutoría",
      "tutoria",
      "educación",
      "educacion",
      "habilidades",
    ].includes(p);

    const initiativeName = isGenericKeyword
      ? archetypeBase.initiativeName
      : cleanPrompt.length <= 40
        ? cleanPrompt
        : cleanPrompt.slice(0, 35) + " Core";

    if (archetypeBase === ARCHETYPES.learning) {
      base = {
        ...archetypeBase,
        initiativeName,
        sector,
        summary: `Itinerario de formación enfocado en: ${cleanPrompt}. Orientado al aprendizaje guiado y resolución de dudas con un tutor.`,
        description: `Proceso de estudio y desarrollo de competencias en «${cleanPrompt}». Buscamos acompañamiento tutorial para resolver dudas conceptuales, avanzar en el plan formativo y practicar habilidades con retroalimentación.`,
        cycleGoals: `Dominio conceptual y aplicación práctica de competencias en «${cleanPrompt}».`,
        compatibilityRationale: `Alineación pedagógica: Tutor/mentor con experiencia en ${sector} y metodologías de enseñanza personalizada.`,
      };
    } else {
      base = {
        ...archetypeBase,
        initiativeName,
        sector,
        summary: `Iniciativa enfocada en: ${cleanPrompt}. Orientada a resolver ineficiencias de mercado mediante acompañamiento estructurado.`,
        description: `Buscamos validar críticamente la propuesta de valor para «${cleanPrompt}». Necesitamos acompañamiento de mentoría para estructurar entrevistas con clientes, verificar la disposición real a pagar y evitar invertir tiempo en supuestos no probados.`,
        cycleGoals: `Validar la propuesta de valor y modelo de tracción para «${cleanPrompt}».`,
        compatibilityRationale: `Alineación de alto impacto: Mentor con experiencia probada en ${sector} y modelos de negocio tempranos. Ideal para acompañar la iniciativa «${cleanPrompt}».`,
      };
    }
  } else {
    base = { ...ARCHETYPES.general };
  }

  if (preferredMentorName) {
    base.suggestedMentorName = preferredMentorName;
  }

  return base;
}
