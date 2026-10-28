# Flujos de usuario

## Flujo de la Fase Cero (12 pasos)

| # | Paso | Quién | Dónde | Estado |
|---|---|---|---|---|
| 1 | Entrar con un perfil | Todos | `/entrar` | PARTIAL: acceso DEMO, sin autenticación real |
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

## Fase del proyecto (derivada)

La fase no se guarda: se calcula en `features/projects/phase.ts` a partir del estado real (mensajes, resumen confirmado, sesiones, hipótesis, experimentos). Así no puede desincronizarse.

`new → conversation → summary_pending → mentor_review_1 → prioritizing → hypotheses → experiments_preparing → experiments_running → results_review → decided`

Cada fase tiene un "siguiente paso" por tipo de persona (`features/projects/next-step.ts`), visible en la barra lateral del proyecto.

## Recorrido DEMO

- **Ana Rojas** (emprendedora) tiene "Almuerzos saludables para oficinas" con todo el flujo hecho hasta pedir la segunda revisión: dos elementos pendientes, una corrección, dos desconocidos, primera revisión de Carla, hipótesis aprobada, experimento con resultado negativo.
- **Luis Mora** tiene "Taller de bicicletas a domicilio" con un solo mensaje: sirve para probar la entrevista desde cero.
- **Carla Jiménez** (mentora asignada a Ana) puede hacer la segunda revisión.
- **Diego** (mentor sin asignación) no ve ningún proyecto.
- **Administración** asigna mentores y ve solo metadatos.

## Casos límite cubiertos

- El emprendedor responde "no sé": se crea una pregunta abierta, no una afirmación.
- Respuesta mixta ("tengo 3 clientes, no tengo presupuesto"): se separa por oraciones.
- Contradicción con algo confirmado: se crea un elemento "necesita aclaración", no se pisa lo confirmado.
- Dos pestañas editan el mismo elemento: la segunda recibe conflicto y recarga.
- La IA falla: el mensaje del emprendedor se guarda, se muestra el error y no se inventa una respuesta.
- Mentor sin conversación compartida: ve diagnóstico y briefing, no los mensajes.
