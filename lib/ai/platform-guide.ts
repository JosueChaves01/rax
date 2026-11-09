import type { Role } from "@/types/domain";
import { B2B_STAGES, STAGES } from "@/features/projects/stages";
import { isB2BFlow } from "@/lib/flags";

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
  /** Solo existe en el flujo B2B (RAX_B2B_FLOW): con la bandera apagada no se nombra al agente. */
  flow?: "b2b";
}

/** Páginas generales (fuera de un proyecto). */
export const PLATFORM_PAGES: PlatformPage[] = [
  { path: "/app", label: "Mis proyectos / Bandeja", what: "Emprendedor: sus proyectos, cada uno con las 4 etapas, a quién le toca y el siguiente paso; desde aquí crea un proyecto nuevo. Mentor: la bandeja de revisiones e hipótesis por aprobar, más vieja primero, y sus proyectos.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/chat", label: "Asistente IA", what: "Chat con el agente organizado como Proyecto → Sesión → Hilo: cada proyecto tiene sesiones de trabajo (con objetivo y notas que mantiene el agente) y cada sesión tiene varios hilos de conversación. Incluye instrucciones del proyecto y base de conocimiento (documentos, descargables en PDF o Word). El agente puede generar documentos en PDF o Word sobre un tema y agregarlos al proyecto. Con el clip del mensaje se adjunta un PDF, Word, Excel o CSV: queda en los documentos del proyecto y el agente lo lee y calcula sobre sus tablas. El agente también puede buscar en internet cuando la búsqueda web está activada. Desde aquí se puede llevar todo el ciclo.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/mentor", label: "Emprendedores", what: "Cartera del mentor: proyectos asignados, cupo y estado de cada uno.", roles: ["mentor"] },
  { path: "/app/tareas", label: "Tareas", what: "Tareas de un proyecto (se elige arriba), con estado, fecha y bloqueos.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/sesiones", label: "Sesiones", what: "Agenda de las sesiones de mentoría de todos los proyectos (próximas, abiertas y cerradas, con su fecha pedida o confirmada por el mentor), con vista de calendario (/app/calendario). Es un índice: cada sesión se trabaja dentro de su proyecto, en Orientar (primera revisión y seguimientos) o Decidir (segunda revisión). Ahí está el briefing (se prepara solo al pedir la revisión), la videollamada con transcripción, las notas con sus respuestas, la síntesis (se arma sola al colgar y se puede editar) y el cierre del mentor: acuerdo y problema prioritario, o decisión formal. Al cerrar, los compromisos del emprendedor se vuelven tareas.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/documentos", label: "Documentos", what: "Apoyo: biblioteca con los documentos de todos tus proyectos (los que compartió el mentor, los que generó el asistente y las transcripciones), filtrables por proyecto o «solo del mentor», más la biblioteca metodológica de guías y plantillas. Todo se descarga en PDF o Word.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/aprendizaje", label: "Aprendizaje", what: "Apoyo: tutor de ejercicios; el agente propone ejercicios según el objetivo del proyecto y los evalúa con puntaje y retroalimentación.", roles: ["entrepreneur", "mentor"] },
  { path: "/app/mentor/perfil", label: "Mi perfil", what: "Perfil del mentor: presentación, metodología, guía de la entrevista de intake (preguntas con tema, para qué sirven y si son obligatorias), tono del asistente y su biblioteca de documentos (metodología, plantillas, referencias), que el asistente usa para entrevistar y responder a sus clientes.", roles: ["mentor"], flow: "b2b" },
  { path: "/app/mentor/recursos", label: "Recursos", what: "Apoyo: biblioteca de recursos y plantillas metodológicas del mentor.", roles: ["mentor"] },
  { path: "/app/admin", label: "Operaciones", what: "Panel de administración: proyectos sin mentor, solicitudes de mentores, cupos, personas y auditoría.", roles: ["admin"] },
  { path: "/app/reportes", label: "Reportes", what: "Indicadores agregados de la plataforma.", roles: ["admin"] },
];

/** Páginas dentro de un proyecto (/app/p/[id]/...), agrupadas por etapa. */
export const PROJECT_PAGES: Array<{ slug: string; label: string; stage: string; what: string }> = [
  { slug: "", label: "Inicio del proyecto", stage: "todas", what: "Qué sigue, a quién le toca y pendientes." },
  { slug: "conversacion", label: "Conversación", stage: "Entender", what: "Conversación con el agente que alimenta el diagnóstico vivo. Tiene varios hilos." },
  { slug: "diagnostico", label: "Diagnóstico vivo", stage: "Entender", what: "Hallazgos por categoría (contexto, personas/mercado, problema, soluciones, finanzas, operación, comercial, legal, riesgos, preguntas abiertas) con estado de revisión e incertidumbre, y el resumen que confirma el emprendedor." },
  { slug: "orientar", label: "Revisión con el mentor", stage: "Orientar", what: "Primera revisión con el mentor y sesiones de seguimiento. Arriba se ve el ciclo de mentoría (primera revisión → probar → segunda revisión → cierre del ciclo). Cada sesión abierta se trabaja en 3 pasos: Preparar (fecha y briefing, que se prepara solo al pedirla), Reunión (llamada con transcripción y notas con respuestas) y Cierre (síntesis editable y cierre único del mentor con el acuerdo y el problema a investigar primero). Las sesiones cerradas quedan en el historial. También muestra los documentos que compartió el mentor." },
  { slug: "acuerdos", label: "Acuerdo y objetivos", stage: "Orientar", what: "Acuerdo de mentoría (frecuencia, alcance, compromisos) y objetivos del ciclo." },
  { slug: "validacion", label: "Hipótesis y experimentos", stage: "Probar", what: "Hipótesis (el mentor las aprueba), experimentos con criterios de éxito y descarte fijados antes de empezar, sus tareas y su evidencia." },
  { slug: "decidir", label: "Segunda revisión", stage: "Decidir", what: "Revisión de resultados con el mentor (mismos 3 pasos: Preparar, Reunión, Cierre) y decisión del mentor: continuar, reformular, profundizar, pausar o descartar." },
  { slug: "evaluacion", label: "Cierre del ciclo", stage: "Decidir", what: "Evaluación del ciclo de mentoría que hace el mentor al final: objetivos logrados, autonomía y si se renueva (nuevo ciclo) o se cierra." },
  { slug: "documentos", label: "Documentos", stage: "Archivo", what: "Documentos del proyecto (del mentor, propios, del chat y transcripciones de llamadas) para descargar en PDF o Word. El mentor y el equipo pueden compartir uno nuevo pegando el texto o subiendo un archivo (PDF, Word, Excel, CSV o texto)." },
  { slug: "historial", label: "Evidencia e historial", stage: "Archivo", what: "Evidencia cargada y cambios del diagnóstico." },
  { slug: "tareas", label: "Hoja de ruta y tareas", stage: "Archivo", what: "Hitos de la hoja de ruta y todas las tareas del proyecto." },
];

const ROLE_GUIDE: Record<Role, string> = {
  entrepreneur: `La persona es EMPRENDEDORA o ESTUDIANTE (dueña o colaboradora del proyecto). Puede:
- Conversar con el agente, revisar y corregir su diagnóstico, y confirmar el resumen (solo la dueña).
- Pedir la revisión del mentor con la fecha y hora que prefiere (queda pendiente hasta que el mentor la confirma), proponer hipótesis, diseñar e iniciar experimentos, registrar resultados y evidencia.
- Gestionar tareas, objetivos y el acuerdo junto con su mentor.
No elige mentor: lo asigna administración. No puede aprobar hipótesis ni tomar las decisiones del mentor: eso le corresponde a su mentor asignado.`,
  mentor: `La persona es MENTORA o TUTORA asignada al proyecto. Puede:
- Ver el diagnóstico y el briefing (la conversación del emprendedor solo si la compartió).
- Confirmar la fecha de las revisiones que le piden (o proponer otra), dejar notas y preguntas en sesiones, priorizar el problema, pedir aclaraciones.
- Aprobar, devolver o descartar hipótesis; registrar la decisión de la segunda revisión; evaluar el ciclo.
- Gestionar tareas, objetivos y el acuerdo con el emprendedor.
No edita el diagnóstico del emprendedor ni confirma su resumen: le sugiere cambios.`,
  admin: `La persona es de ADMINISTRACIÓN. Gestiona la operación (asignar mentores, aprobar postulaciones, auditar) desde /app/admin.
No tiene acceso al contenido de los proyectos por ser admin: no inventes datos de proyectos que no ves.`,
};

/* ───────────── Flujo B2B (RAX_B2B_FLOW) ───────────── */

/** Qué es cada pantalla general en el flujo B2B (reemplaza la descripción del flujo viejo). */
const B2B_PAGE_WHAT: Record<string, Partial<Record<Role, string>>> = {
  "/app": {
    entrepreneur: "Inicio de la persona cliente: invitaciones de mentores (las acepta o rechaza aquí), sus proyectos con la etapa del ciclo, la entrevista pendiente, la próxima sesión y el material nuevo.",
    mentor: "Bandeja del mentor: lo que pide su atención (entrevistas listas para revisar, sesiones por agendar, comentarios nuevos).",
  },
  "/app/chat": { mentor: "Asistente del mentor: chat por proyecto, con sesiones de trabajo e hilos, que conoce el estado del ciclo, el brief y la biblioteca del mentor; prepara sesiones y genera documentos en PDF o Word." },
  "/app/mentor": { mentor: "Clientes: los proyectos del mentor con su etapa del ciclo y el estado de las invitaciones; desde aquí crea un proyecto nuevo (individual o grupal) e invita a sus clientes por correo." },
  "/app/sesiones": {
    entrepreneur: "Agenda de las sesiones con el mentor en todos los proyectos. Cada proyecto tiene además su pestaña Sesiones.",
    mentor: "Agenda de las sesiones de todos los proyectos. Cada proyecto tiene además su pestaña Sesiones, donde se agenda y se arma la agenda de temas.",
  },
  "/app/documentos": { entrepreneur: "Material: lo que el mentor publicó para la persona (guías, resúmenes de sesión), para leer, descargar y comentar." },
};

/** Pantallas generales del menú B2B de cada rol (alineado con navFor(role, …, { b2b: true })). */
export const B2B_NAV_PATHS: Partial<Record<Role, string[]>> = {
  mentor: ["/app", "/app/mentor", "/app/chat", "/app/sesiones", "/app/mentor/perfil"],
  entrepreneur: ["/app", "/app/sesiones", "/app/documentos"],
};

/** Páginas dentro de un proyecto B2B (/app/p/[id]/...). */
export const B2B_PROJECT_PAGES: Array<{ slug: string; label: string; roles: Role[]; what: string }> = [
  { slug: "", label: "Inicio del proyecto", roles: ["entrepreneur", "mentor"], what: "Línea del ciclo (Entrevista → Sesión 1 → Ciclo → Cierre), la próxima sesión (el cliente confirma su asistencia y se une a la llamada; el mentor la agenda), el estado de la entrevista, el resumen de la última sesión, el acuerdo y los compromisos." },
  { slug: "intake", label: "Entrevista", roles: ["entrepreneur"], what: "Entrevista de intake con el asistente, guiada por las preguntas del mentor, con una barra de avance por tema. Al enviarla, el mentor recibe un brief y prepara la Sesión 1." },
  { slug: "brief", label: "Brief", roles: ["mentor"], what: "Brief del intake de cada persona (en proyectos grupales, también el consolidado): resumen, respuestas, brechas, riesgos y agenda sugerida; el mentor completa el contexto que falta y lo marca revisado." },
  { slug: "sesiones", label: "Sesiones", roles: ["entrepreneur", "mentor"], what: "Todas las sesiones con su número, fecha, estado y temas. El mentor agenda, edita la agenda (agregar temas, marcarlos cubiertos) y abre la sala; el cliente confirma asistencia y se une. Muestra el acuerdo vigente (solo lectura para el cliente) y la síntesis de cada sesión realizada." },
];

const B2B_ROLE_GUIDE: Partial<Record<Role, string>> = {
  entrepreneur: `La persona es CLIENTE de un mentor: entró por invitación del mentor. Puede:
- Aceptar o rechazar invitaciones desde su panel.
- Responder la entrevista de intake de cada proyecto (una por persona en proyectos grupales).
- Ver sus sesiones, confirmar su asistencia y unirse a la llamada; leer el acuerdo, los objetivos, la síntesis de cada sesión y sus compromisos.
- Leer y comentar el material que el mentor publicó.
No crea proyectos, no agenda sesiones, no edita el acuerdo ni sube documentos: eso lo hace su mentor. No ve el brief del intake ni las notas privadas del mentor.`,
  mentor: `La persona es MENTORA: dueña operativa de sus proyectos. Puede:
- Crear proyectos (individuales o grupales) e invitar a sus clientes por correo; configurar su perfil, su metodología, la guía de la entrevista y su biblioteca de documentos (Mi perfil).
- Leer el brief del intake y completar el contexto que falta.
- Agendar la Sesión 1 y las sesiones del ciclo, armar la agenda de temas de cada una y conducirlas desde la sala (notas en vivo, acuerdo y objetivos en la Sesión 1, síntesis al cerrar).
- Al cerrar una sesión, lo que no se cubrió pasa a la siguiente, que queda sugerida sin fecha.
- Publicar material para sus clientes.`,
};

function renderB2BPlatformGuide(role: Role): string {
  const stages = B2B_STAGES.map((s) => `${s.n}. «${s.label}» — ${s.question}`).join("\n");
  const pages = PLATFORM_PAGES.filter((p) => p.roles.includes(role) && (B2B_NAV_PATHS[role] ?? []).includes(p.path))
    .map((p) => `- ${p.label} (${p.path}): ${B2B_PAGE_WHAT[p.path]?.[role] ?? p.what}`)
    .join("\n");
  const projectPages = B2B_PROJECT_PAGES.filter((p) => p.roles.includes(role))
    .map((p) => `- ${p.label} (/${p.slug}): ${p.what}`)
    .join("\n");
  return `<platform_guide flow="b2b">
RAX es la plataforma de trabajo de un mentor con sus clientes. El mentor crea cada proyecto e invita a una persona (proyecto individual) o a varias (proyecto grupal); el asistente entrevista a los clientes, prepara al mentor y acompaña entre sesiones. La IA estructura, propone y explica; el mentor decide.

Ciclo de cada proyecto (la etapa es explícita y la avanza el sistema al pasar cada hito):
${stages}
Entrevista: cada persona cliente responde la entrevista de intake; al enviarla se crea la Sesión 1 pendiente. Sesión 1: el mentor la agenda y en ella se acuerdan la forma de trabajo y los objetivos; al cerrarla el proyecto pasa a «Ciclo» y queda sugerida la Sesión 2 con los temas del acuerdo. Ciclo: una sesión tras otra, cada una con su agenda; lo no cubierto pasa a la siguiente. Cierre: el mentor cierra el ciclo.

${B2B_ROLE_GUIDE[role] ?? ROLE_GUIDE[role]}

Pantallas disponibles para este rol:
${pages}
Dentro de cada proyecto (/app/p/<id>/...):
${projectPages}
- Sala de la sesión (/app/llamada/<sesión>): videollamada con transcripción${role === "mentor" ? ", notas en vivo, asistente y formulario de acuerdo" : ""}.

Cómo actúa el agente en la plataforma:
- Las herramientas generan PROPUESTAS que aparecen como tarjetas; queda guardado cuando la persona las aplica. Nunca digas que algo ya quedó guardado.
- Si te preguntan cómo hacer algo en RAX, explica el paso y nombra la pantalla y su ruta.
- Si una acción le corresponde al otro rol (por ejemplo agendar una sesión, que es del mentor), dilo y sugiere cómo pedírsela.
</platform_guide>`;
}

/**
 * Guía de la plataforma adaptada al rol de quien conversa. Con RAX_B2B_FLOW encendida (o `b2b: true`)
 * describe el flujo del mentor y sus clientes; apagada, el flujo de siempre sin cambios.
 */
export function renderPlatformGuide(role: Role, opts: { b2b?: boolean } = {}): string {
  const b2b = opts.b2b ?? isB2BFlow();
  if (b2b && role !== "admin") return renderB2BPlatformGuide(role);
  const stages = STAGES.map((s) => `${s.n}. «${s.label}» — ${s.question}`).join("\n");
  const pages = PLATFORM_PAGES.filter((p) => p.roles.includes(role) && (!p.flow || b2b))
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
