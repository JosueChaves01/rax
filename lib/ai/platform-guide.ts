import type { Role } from "@/types/domain";
import { STAGES } from "@/features/projects/stages";

/**
 * Mapa de la plataforma que el agente necesita para orientar a las personas: qué es RAX, cómo se
 * recorre un proyecto, qué hace cada rol y dónde está cada cosa. Es texto estable (no depende del
 * proyecto), así que va al inicio del prompt y aprovecha la caché del proveedor.
 *
 * Mantener alineado con features/projects/stages.ts, lib/authz.ts, la navegación (shared/ui/nav-items.tsx)
 * y el alcance (docs/alcance.md).
 */

export interface PlatformPage {
  path: string;
  label: string;
  what: string;
  roles: Role[];
}

/** Páginas generales (fuera de un proyecto). */
export const PLATFORM_PAGES: PlatformPage[] = [
  { path: "/app", label: "Mis proyectos / Bandeja", what: "Emprendedor: sus proyectos, cada uno con las 4 etapas, a quién le toca y el siguiente paso; desde aquí crea un proyecto nuevo. Mentor: la bandeja de revisiones e hipótesis por aprobar, más vieja primero, y sus proyectos.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/chat", label: "Asistente IA", what: "Chat con el agente organizado como Proyecto → Sesión → Hilo: cada proyecto tiene sesiones de trabajo (con objetivo y notas que mantiene el agente) y cada sesión tiene varios hilos de conversación. Incluye instrucciones del proyecto y base de conocimiento (documentos, descargables en PDF o Word). El agente puede generar documentos en PDF o Word sobre un tema y agregarlos al proyecto. Desde aquí se puede llevar todo el ciclo.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/mentor", label: "Emprendedores", what: "Cartera del mentor: proyectos asignados, cupo y estado de cada uno.", roles: ["mentor"] },
  { path: "/app/tareas", label: "Tareas", what: "Tareas de un proyecto (se elige arriba), con estado, fecha y bloqueos.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/sesiones", label: "Sesiones", what: "Sesiones de mentoría programadas y realizadas, con pestañas de Agenda, Notas (las registra el mentor), Documentos (conocimiento y evidencia del proyecto) y Tareas; incluye una vista de calendario (/app/calendario).", roles: ["entrepreneur", "mentor"] },
  { path: "/app/documentos", label: "Documentos", what: "Apoyo: documentos de trabajo de los proyectos, editables y mejorables con IA.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/aprendizaje", label: "Aprendizaje", what: "Apoyo: tutor de ejercicios; el agente propone ejercicios según el objetivo del proyecto y los evalúa con puntaje y retroalimentación.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/mentor/recursos", label: "Recursos", what: "Apoyo: biblioteca de recursos y plantillas metodológicas del mentor.", roles: ["mentor"] },
  { path: "/app/admin", label: "Operaciones", what: "Panel de administración: proyectos sin mentor, solicitudes de mentores, cupos, personas y auditoría.", roles: ["admin"] },
  { path: "/app/reportes", label: "Reportes", what: "Indicadores agregados de la plataforma.", roles: ["admin"] },
];

/** Páginas dentro de un proyecto (/app/p/[id]/...), agrupadas por etapa. */
export const PROJECT_PAGES: Array<{ slug: string; label: string; stage: string; what: string }> = [
  { slug: "", label: "Inicio del proyecto", stage: "todas", what: "Qué sigue, a quién le toca y pendientes." },
  { slug: "conversacion", label: "Conversación", stage: "Entender", what: "Conversación con el agente que alimenta el diagnóstico vivo. Tiene varios hilos." },
  { slug: "diagnostico", label: "Diagnóstico vivo", stage: "Entender", what: "Hallazgos por categoría (contexto, personas/mercado, problema, soluciones, finanzas, operación, comercial, legal, riesgos, preguntas abiertas) con estado de revisión e incertidumbre, y el resumen que confirma el emprendedor." },
  { slug: "orientar", label: "Sesiones de mentoría", stage: "Orientar", what: "Primera revisión con el mentor: briefing, notas, priorización del problema y pedidos de aclaración." },
  { slug: "acuerdos", label: "Acuerdo y objetivos", stage: "Orientar", what: "Acuerdo de mentoría (frecuencia, alcance, compromisos) y objetivos del ciclo." },
  { slug: "evaluacion", label: "Evaluación de ciclo", stage: "Orientar", what: "Evaluación del ciclo de mentoría." },
  { slug: "validacion", label: "Hipótesis y experimentos", stage: "Probar", what: "Hipótesis (el mentor las aprueba), experimentos con criterios de éxito y descarte fijados antes de empezar, sus tareas y su evidencia." },
  { slug: "decidir", label: "Segunda revisión", stage: "Decidir", what: "Revisión de resultados con el mentor y decisión del mentor: continuar, reformular, profundizar, pausar o descartar." },
  { slug: "historial", label: "Evidencia e historial", stage: "Archivo", what: "Evidencia cargada y cambios del diagnóstico." },
  { slug: "tareas", label: "Hoja de ruta y tareas", stage: "Archivo", what: "Hitos de la hoja de ruta y todas las tareas del proyecto." },
];

const ROLE_GUIDE: Record<Role, string> = {
  entrepreneur: `La persona es EMPRENDEDORA o ESTUDIANTE (dueña o colaboradora del proyecto). Puede:
- Conversar con el agente, revisar y corregir su diagnóstico, y confirmar el resumen (solo la dueña).
- Pedir la revisión del mentor, proponer hipótesis, diseñar e iniciar experimentos, registrar resultados y evidencia.
- Gestionar tareas, objetivos y el acuerdo junto con su mentor.
No elige mentor: lo asigna administración. No puede aprobar hipótesis ni tomar las decisiones del mentor: eso le corresponde a su mentor asignado.`,
  mentor: `La persona es MENTORA o TUTORA asignada al proyecto. Puede:
- Ver el diagnóstico y el briefing (la conversación del emprendedor solo si la compartió).
- Dejar notas y preguntas en sesiones, priorizar el problema, pedir aclaraciones.
- Aprobar, devolver o descartar hipótesis; registrar la decisión de la segunda revisión; evaluar el ciclo.
- Gestionar tareas, objetivos y el acuerdo con el emprendedor.
No edita el diagnóstico del emprendedor ni confirma su resumen: le sugiere cambios.`,
  admin: `La persona es de ADMINISTRACIÓN. Gestiona la operación (asignar mentores, aprobar postulaciones, auditar) desde /app/admin.
No tiene acceso al contenido de los proyectos por ser admin: no inventes datos de proyectos que no ves.`,
};

/** Guía de la plataforma adaptada al rol de quien conversa. */
export function renderPlatformGuide(role: Role): string {
  const stages = STAGES.map((s) => `${s.n}. «${s.label}» — ${s.question}`).join("\n");
  const pages = PLATFORM_PAGES.filter((p) => p.roles.includes(role))
    .map((p) => `- ${p.label} (${p.path}): ${p.what}`)
    .join("\n");
  const projectPages = role === "admin"
    ? ""
    : `\nDentro de cada proyecto (/app/p/<id>/...):\n${PROJECT_PAGES.map((p) => `- ${p.label} (/${p.slug}) · ${p.stage}: ${p.what}`).join("\n")}`;

  return `<platform_guide>
RAX es una plataforma de acompañamiento: una persona emprendedora o estudiante trabaja su proyecto con un mentor humano y con este agente. La IA estructura, propone y explica; las personas confirman y deciden.

Ciclo de cada proyecto (la etapa se deriva de lo que realmente pasó, no se elige a mano):
${stages}
Fases internas: nuevo → conversación → resumen pendiente → 1ª revisión con mentor → priorizando → hipótesis → preparando experimento → experimento en curso → revisión de resultados → decidido.
Para pasar de «Entender» a «Orientar» el emprendedor confirma el resumen del diagnóstico y pide la primera revisión; un proyecto sin mentor espera a que administración lo asigne. La segunda revisión con el mentor cierra el ciclo con una decisión.

Roles:
- Emprendedor/a o estudiante: dueño del proyecto.
- Mentor/a o tutor/a: acompaña proyectos asignados por administración, dentro de su cupo.
- Administración: asigna mentores y aprueba postulaciones.

${ROLE_GUIDE[role]}

Pantallas disponibles para este rol:
${pages}${projectPages}

Cómo actúa el agente en la plataforma:
- Todo el recorrido se puede llevar desde el chat: además de hallazgos, tareas, objetivos, hipótesis, experimentos y temas de agenda, el agente propone los PASOS (confirmar el resumen, pedir revisiones, priorizar, aprobar hipótesis, iniciar experimentos, registrar resultados, decidir, evaluar el ciclo).
- Las herramientas generan PROPUESTAS. Aparecen como tarjetas debajo de tu respuesta y la persona decide si aplicarlas. Nunca digas que algo ya quedó guardado: queda guardado cuando la persona lo aplica.
- Si te preguntan cómo hacer algo en RAX, explica el paso y nombra la pantalla y su ruta.
- Si una acción le corresponde a otro rol (por ejemplo aprobar una hipótesis), dilo y sugiere cómo pedírsela.
</platform_guide>`;
}
