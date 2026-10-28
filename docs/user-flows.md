# Flujos de usuario

## Flujo de la Fase Cero (12 pasos)

| # | Paso | Quién | Dónde | Estado |
|---|---|---|---|---|
| 1 | Crear cuenta, confirmar correo y hacer el onboarding | Todos | `/entrar`, `/bienvenida` | IMPLEMENTED (Auth sin verificación en vivo) |
| 2 | Crear proyecto (nombre, descripción, naturaleza) | Emprendedor | `/app` | IMPLEMENTED |
| 3 | Entrevista guiada por 9 dimensiones | Emprendedor + IA | `/app/p/[id]` | IMPLEMENTED (simulación); OpenRouter IMPLEMENTED sin verificación en vivo |
| 4 | La IA archiva cada respuesta como elementos con cita | IA | conversación → diagnóstico | IMPLEMENTED |
| 5 | Borrador de resumen y confirmación del emprendedor | IA + Emprendedor | `/diagnostico` | IMPLEMENTED |
| 6 | Revisar elementos: confirmar, corregir, rechazar, aclarar, desconocido | Emprendedor | `/diagnostico` | IMPLEMENTED |
| 7 | Asignar mentor | Administración | `/app/admin` | IMPLEMENTED |
| 8 | Primera revisión: briefing, notas, priorizar, pedir aclaraciones | Mentor | `/mentoria`, `/diagnostico` | IMPLEMENTED |
| 9 | Proponer hipótesis y enviarla a aprobación | Emprendedor | `/validacion` | IMPLEMENTED |
| 10 | Aprobar, devolver o descartar hipótesis | Mentor asignado | `/validacion` | IMPLEMENTED |
| 11 | Diseñar e iniciar experimento (criterios bloqueados), tareas y evidencias | Emprendedor | `/validacion`, `/tareas`, `/historial` | IMPLEMENTED (archivos: solo metadatos, sin subida real) |
| 12 | Registrar resultado y segunda revisión con decisión | Emprendedor + Mentor | `/validacion`, `/mentoria` | IMPLEMENTED |

## Navegación por etapas

El proyecto se navega por 4 etapas que agrupan las 10 fases (`features/projects/stages.ts`), más un Inicio y un Archivo:

| Sección | Páginas | Fases |
|---|---|---|
| Inicio | `/app/p/[id]`: lo que sigue, a quién le toca y pendientes | todas |
| 1 · Entender | `/conversacion`, `/diagnostico` | nuevo, conversación, resumen pendiente |
| 2 · Orientar | `/orientar` (primera revisión) | 1ª revisión, priorizando |
| 3 · Probar | `/validacion`, `/tareas` | hipótesis, preparar experimento, en curso |
| 4 · Decidir | `/decidir` (segunda revisión) | resultados, etapa concluida |
| Archivo | `/historial` | consulta |

`/mentoria` redirige a la revisión que corresponde. `turnOf` dice a quién le toca mover el proyecto (emprendedor, mentor o administración, por ejemplo cuando falta asignar mentor). En celular, Inicio y las etapas van en una barra inferior.

## Fase del proyecto (derivada)

La fase no se guarda: se calcula en `features/projects/phase.ts` a partir del estado real (mensajes, resumen confirmado, sesiones, hipótesis, experimentos). Así no puede desincronizarse.

`new → conversation → summary_pending → mentor_review_1 → prioritizing → hypotheses → experiments_preparing → experiments_running → results_review → decided`

Cada fase tiene un "siguiente paso" por tipo de persona (`features/projects/next-step.ts`), visible en la barra lateral del proyecto.

## Onboarding por tipo de persona

Toda cuenta empieza en `/bienvenida` y elige cómo va a usar RAX.

| Persona | Qué se le pregunta | Para qué se usa | Después |
|---|---|---|---|
| Emprendedor | Etapa y sector; objetivos con RAX, horas por semana, qué espera del mentor; primer proyecto | El mentor lo ve en mentoría; la administración lo usa para asignar | Se crea el proyecto y entra directo a la conversación (`/app/p/[id]/conversacion`) |
| Mentor | Años de experiencia, bio, LinkedIn; especialidades, sectores, horas por mes, máximo de proyectos | El emprendedor ve sus especialidades; la administración ve su cupo al asignar | Queda como postulación: ve una pantalla de estado hasta que la administración la aprueba o la rechaza (puede volver a postularse) |
| Administración | Organización y programa | Contexto del panel | Solo cuentas que ya son admin (asignado por SQL); va a `/app/admin` |

## Casos límite cubiertos

- El emprendedor responde "no sé": se crea una pregunta abierta, no una afirmación.
- Respuesta mixta ("tengo 3 clientes, no tengo presupuesto"): se separa por oraciones.
- Contradicción con algo confirmado: se crea un elemento "necesita aclaración", no se pisa lo confirmado.
- Dos pestañas editan el mismo elemento: la segunda recibe conflicto y recarga.
- La IA falla: el mensaje del emprendedor se guarda, se muestra el error y no se inventa una respuesta.
- Mentor sin conversación compartida: ve diagnóstico y briefing, no los mensajes.
