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
