# Comportamiento de la IA

La IA de RAX es un **motor de estructuración**: entrevista, archiva y señala. No da veredictos sobre la idea, no inventa datos de mercado y no aprueba nada.

## Proveedores

| Proveedor | Cuándo | Estado |
|---|---|---|
| `SimulatedProvider` (`lib/ai/simulated.ts`) | Sin `OPENROUTER_API_KEY` | IMPLEMENTED. Determinista, basado en reglas; la interfaz lo etiqueta "Simulación". |
| `OpenRouterProvider` (`lib/ai/openrouter.ts`) | Con `OPENROUTER_API_KEY` | IMPLEMENTED y probado con respuestas simuladas de `fetch`. **No verificado contra la API real** (el entorno de desarrollo no tenía salida a openrouter.ai). |

Modelo por defecto: `meta-llama/llama-3.3-70b-instruct:free`. Los modelos gratuitos de OpenRouter cambian; si ese id deja de existir, elegir otro con sufijo `:free` en https://openrouter.ai/models y ponerlo en `OPENROUTER_MODEL`. Conviene uno que respete `response_format: json_object`. Los modelos gratuitos tienen límites de uso bajos y no se simula una respuesta cuando fallan. El adaptador:

- Prueba en orden `OPENROUTER_MODEL` y los de `OPENROUTER_FALLBACK_MODELS` cuando un modelo está saturado (429 del proveedor de origen), no existe (404), tarda (408/5xx) o devuelve JSON inválido.
- Distingue el **cupo diario de la cuenta** (`free-models-per-day`: 50 pedidos por día sin créditos, más con créditos cargados): ahí no prueba otros modelos porque el cupo es de la cuenta, y lo dice tal cual.
- Si un modelo no acepta instrucciones de sistema (p. ej. algunos Gemma) las pasa al primer mensaje; si no admite `response_format`, reintenta sin modo JSON (la salida igual se valida con zod).
- Registra en el log del servidor el estado HTTP y el mensaje real del proveedor (`[openrouter] modelo: HTTP 429: …`), nunca la clave ni el contenido.

## Agente conversacional (chat, conversación del proyecto, Aprendizaje, ayudas de formularios)

Todas las pantallas que conversan con la IA usan el mismo agente (`lib/services/agent-turn.ts` → `lib/ai/claude-orchestrator.ts`). `sendMainAgentMessageAction` (RAX-02) solo va a n8n si `RAX_N8N_MAIN_AGENT_ENABLED=true`; si no, usa este agente.

En cada turno el modelo recibe, de lo más estable a lo más variable (para aprovechar la caché del proveedor):

1. **Identidad y reglas**: honestidad, roles, regla anti-sesgo comercial en proyectos de aprendizaje.
2. **Guía de la plataforma** (`lib/ai/platform-guide.ts`): las 4 etapas y 10 fases, qué puede hacer cada rol y las pantallas con su ruta, filtradas por el rol de quien conversa. Mantenerla alineada con `features/projects/stages.ts`, `lib/authz.ts` y la navegación.
3. **Playbook por etapa** y guía de herramientas (`RAX_WORKFLOW_TOOLS`).
4. **Instrucciones y conocimiento del proyecto** (documentos completos o pasajes RAG).
5. **Estado del proyecto** (`lib/ai/project-state.ts`): se arma en el servidor desde `getWorkspace`, con los mismos permisos que las pantallas (la conversación no compartida y las notas privadas ajenas quedan fuera). Incluye etapa, siguiente paso y a quién le toca, diagnóstico, sesiones, acuerdo, objetivos, hipótesis, experimentos, tareas (abiertas, bloqueadas, vencidas) y las acciones que la persona puede hacer. Lo que manda el navegador (`sessionContext`) solo indica la pantalla.
6. **Estado del hilo** (`lib/ai/thread-memory.ts`): cada hilo guarda en `agent_threads.memory` un resumen de los mensajes viejos, las decisiones y las preguntas abiertas. Los últimos mensajes van completos (hasta 20 o 24.000 caracteres); cuando hay más de 20 sin resumir, los más viejos se pliegan en la memoria (con IA si hay clave, si no de forma determinista) y quedan 12 completos. Los mensajes fallidos no cuentan. Cada respuesta anotada con sus propuestas, para que el agente sepa qué ofreció.

Modelos: `CLAUDE_PROJECTS_MODEL` (o `OPENROUTER_MODEL`, o el gratuito por defecto) y después `OPENROUTER_FALLBACK_MODELS`, en orden (`lib/ai/openrouter-chat.ts`). Si un modelo no acepta herramientas o rol de sistema, se reintenta sin ellos.

Herramientas: si el modelo pide herramientas, se ejecutan con los permisos de la persona y sus resultados vuelven al modelo, que redacta la respuesta final (`tool_choice: none`). Las herramientas solo generan **propuestas**; se guardan cuando la persona las aplica. Los borradores de campos de formulario usan `draft_field_value` y no se guardan en el hilo.

Fallos: sin `OPENROUTER_API_KEY` responde la simulación (etiquetada "Simulado"). Con clave, si ningún modelo responde, el mensaje queda como fallo visible ("IA no disponible") con el motivo, sin respuesta ni propuestas inventadas.

## Contrato de salida

`AiTurnSchema` (`lib/ai/schema.ts`, zod):

- `reply`: texto para la persona (una pregunta a la vez).
- `askedDimension`: dimensión de la entrevista que se pregunta.
- `proposals[]`: elementos a crear o actualizar con categoría, título, contenido, tipo de información, incertidumbre y `sourceQuote`.
- `contradictions[]`: choques con elementos existentes.
- `summaryDraft`: borrador del resumen cuando hay suficiente información.

OpenRouter: si el JSON no valida, se reintenta una vez pidiendo corrección; si vuelve a fallar → `AiUnavailableError("invalid_output")`. **Nunca** se recurre a la simulación como respaldo silencioso.

## Reglas que se aplican en código (no solo en el prompt)

`lib/ai/apply.ts` (`vetProposals`):

1. Sin cita literal presente en el mensaje → el elemento pasa a `ai_interpretation`.
2. La IA no puede escribir `verifiable_evidence`, `agreed_decision` ni `human_correction`.
3. Actualizar un elemento revisado por una persona se convierte en crear uno nuevo.
4. Contenido ya rechazado no se vuelve a proponer.
5. Las contradicciones crean elementos `needs_clarification`; no modifican lo confirmado.
6. El borrador de resumen solo se guarda si no había uno.

En Supabase, los triggers `guard_diagnosis_item` repiten 2 y 3 para escrituras sin usuario (service role).

## Memoria contextual

Sin RAG (ver [decisions/0003-no-rag-yet.md](decisions/0003-no-rag-yet.md)). `buildInterviewContext` arma ventanas acotadas: 12 mensajes recientes, 60 elementos vigentes (primero lo revisado por personas), 20 rechazados y 8 notas del mentor, además de las dimensiones ya cubiertas.

## Prompt

`lib/ai/prompt.ts`, versión `PROMPT_VERSION = "2026-10-28.1"`. Cambiar el prompt implica subir la versión. Instrucciones clave: español, una pregunta por turno, citar literal, convertir "no sé" en pregunta abierta, no inventar cifras, no juzgar la idea, devolver solo JSON.

## Auditoría

Cada llamada registra `ai.invoked` (proveedor, modelo, tokens) o `ai.failed` (motivo). No se guardan la clave ni el prompt completo.

## Límites conocidos

- La simulación detecta patrones en español con expresiones regulares; no entiende matices.
- El modelo gratuito puede tardar o estar saturado; el tiempo máximo por intento es 45 s.
- No hay moderación de contenido ni detección de datos personales sensibles.
