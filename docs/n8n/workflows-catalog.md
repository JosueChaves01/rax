# Catálogo de Workflows de n8n para RAX

Este catálogo documenta los 19 workflows diseñados para la plataforma RAX, agrupados por su rol operativo.

---

## 1. Workflows de Infraestructura e Integración

### `RAX-00 — Health Check y Diagnóstico de Integración`
- **Archivo**: `workflows/n8n/RAX-00-health-check.json`
- **Tipo**: Síncrono / Monitoreo.
- **Activador**: Webhook GET `/webhook/rax-health` o ejecución programada.
- **Propósito**: Verifica la conectividad entre n8n, la API de RAX (`GET /api/n8n/health`) y la disponibilidad del modelo en OpenRouter con una consulta de prueba económica (5 tokens).
- **Salida**: Reporte de salud `{ status: "healthy" | "degraded", components: { n8n, raxApi, openRouter } }`.

### `RAX-01 — Ingesta Segura de Eventos de RAX` (no operativo)
- **Archivo**: `workflows/n8n/RAX-01-event-ingress.json`
- **Tipo**: Entrada / Enrutador.
- **Activador**: Webhook POST `/webhook/rax-events`.
- **Estado real**: workflow exportado, pero la ruta de la aplicación responde no disponible y la puerta de eventos está apagada. No acepta ni enruta eventos en uso real. El propósito previsto es validar HMAC, ventana anti-replay (300 s), esquema e idempotencia antes de enrutar.

### `RAX-90 — Gestión Central de Errores`
- **Archivo**: `workflows/n8n/RAX-90-error-handler.json`
- **Tipo**: Sistema / Error Trigger.
- **Activador**: Nodo Error Trigger ante fallos en cualquier workflow.
- **Propósito**: Captura el fallo, clasifica el error entre transitorio (429 rate limit, 503, timeouts) o permanente (400, schema mismatch), sanitiza trazas para eliminar credenciales y reporta el error a RAX vía `POST /api/n8n/callback`.

### `RAX-91 — Reprocesamiento Controlado`
- **Archivo**: `workflows/n8n/RAX-91-controlled-reprocessing.json`
- **Tipo**: Sistema / Administrativo.
- **Activador**: Webhook POST `/webhook/rax-reprocess`.
- **Propósito**: Permite reintentar de forma segura ejecuciones fallidas. Exige rol administrativo o de servicio, genera un nuevo `correlationId` preservando el identificador original y previene la duplicación de efectos secundarios.

### `RAX-99 — Suite de Pruebas y Evaluación de IA`
- **Archivo**: `workflows/n8n/RAX-99-ai-evaluation.json`
- **Tipo**: Evaluación / Calidad.
- **Activador**: Webhook POST `/webhook/rax-run-eval-suite`.
- **Propósito**: Ejecuta de forma determinista la validación de los 12 casos de prueba de aceptación especificados en el proyecto (chat, privacidad, síntesis, criterios ex-ante, resiliencia 429, etc.).

---

## 2. Workflows Conversacionales y Contextuales

### `RAX-02 — Asistente Conversacional de Mentoría`
- **Archivo**: `workflows/n8n/RAX-02-mentor-chat.json`
- **Tipo**: Síncrono (Tiempo real).
- **Activador**: POST `/webhook/rax-chat`.
- **Propósito**: Responde en el chat de mentoría con pedagogía socrática. Aplica filtro estricto de privacidad (las notas de mentor se eliminan si el actor es emprendedor). Devuelve respuesta conversacional y propuestas preliminares en JSON.

### `RAX-03 — Actualización de Memoria y Resumen Contextual`
- **Archivo**: `workflows/n8n/RAX-03-context-memory.json`
- **Tipo**: Asíncrono.
- **Activador**: Eventos `conversation.batch_completed`, `diagnosis.changed`.
- **Propósito**: Sintetiza el estado de la mentoría, identificando decisiones confirmadas, compromisos pendientes y bloqueos sin alterar el historial inmutable ni pisar resúmenes confirmados por humanos.

---

## 3. Workflows de Sesiones y Compromisos

### `RAX-05 — Preparación Inteligente de Sesiones`
- **Archivo**: `workflows/n8n/RAX-05-session-preparation.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento `session.scheduled` o petición manual del mentor.
- **Propósito**: Genera el `MentorBriefing` para el mentor: resumen de cambios desde la última sesión, estado de objetivos, temas clave a tratar y 3 a 5 preguntas potentes.

### `RAX-06 — Síntesis Posterior a una Sesión`
- **Archivo**: `workflows/n8n/RAX-06-session-synthesis.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento `session.notes_submitted`.
- **Propósito**: Transforma notas de sesión en propuestas estructuradas de acuerdos y tareas. Exige cita textual de respaldo (`sourceQuote`) y marca campos ambiguos o no dichos como desconocidos.

### `RAX-08 — Generación y Actualización de Tareas`
- **Archivo**: `workflows/n8n/RAX-08-task-proposals.json`
- **Tipo**: Asíncrono.
- **Activador**: Eventos de sesión, aprobación de plan o hito.
- **Propósito**: Formula propuestas de tareas accionables con criterio de aceptación (`successCriteria`) y evidencia requerida (`evidenceRequired`), evitando duplicados con tareas activas.

### `RAX-09 — Detección de Bloqueos y Próxima Intervención`
- **Archivo**: `workflows/n8n/RAX-09-next-intervention.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento de alerta o análisis diario.
- **Propósito**: Detecta objetivos estancados, retrasos reiterados o falta de evidencia, emitiendo recomendaciones priorizadas con urgencia e impacto para la bandeja del mentor.

### `RAX-10 — Accountability y Recordatorios Programados`
- **Archivo**: `workflows/n8n/RAX-10-accountability-reminders.json`
- **Tipo**: Programado (Cron diario 9:00 AM).
- **Activador**: Schedule Trigger.
- **Propósito**: Detecta tareas vencidas o próximas a vencer y genera borradores de recordatorio para revisión del mentor; jamás envía mensajes externos de forma autónoma.

---

## 4. Workflows de Inteligencia y Metodología

### `RAX-04 — Diagnóstico y Extracción Estructurada`
- **Archivo**: `workflows/n8n/RAX-04-diagnosis.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento `interview.response_received`.
- **Propósito**: Mapea respuestas del emprendedor a las 10 categorías de diagnóstico de RAX (`DiagnosisCategory`), preservando citas textuales y asignando `reviewStatus = proposed`.

### `RAX-07 — Propuesta de Objetivos y Plan de Acción`
- **Archivo**: `workflows/n8n/RAX-07-goals-action-plan.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento `mentorship.agreement_drafted`.
- **Propósito**: Estructura objetivos SMART con línea base documentada (`baseline`), resultado esperado (`targetResult`) e indicador de éxito verificable.

### `RAX-11 — Recomendación de Recursos y Conocimientos`
- **Archivo**: `workflows/n8n/RAX-11-resource-recommendations.json`
- **Tipo**: Asíncrono.
- **Activador**: Eventos de diagnóstico o priorización.
- **Propósito**: Sugiere marcos metodológicos reconocidos (Lean Canvas, Customer Discovery, OKRs) y ejercicios prácticos sin inventar URLs ficticias.

### `RAX-12 — Diseño de Hipótesis y Experimentos`
- **Archivo**: `workflows/n8n/RAX-12-experiment-design.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento `hypothesis.draft_requested`.
- **Propósito**: Formula hipótesis falsables y experimentos ex-ante cuyos criterios de éxito y refutación quedan fijados antes de ejecutar.

### `RAX-13 — Análisis de Resultados y Evidencia`
- **Archivo**: `workflows/n8n/RAX-13-evidence-analysis.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento `experiment.result_submitted`.
- **Propósito**: Contrasta la métrica observada contra los criterios preestablecidos, clasificando el resultado en `supported`, `weakened`, `mixed`, `inconclusive` o `evidence_insufficient`.

### `RAX-14 — Evaluación y Cierre de una Etapa de Mentoría`
- **Archivo**: `workflows/n8n/RAX-14-cycle-evaluation.json`
- **Tipo**: Asíncrono.
- **Activador**: Evento `mentorship.evaluation_requested`.
- **Propósito**: Realiza balance integral de la etapa, comparando línea base vs resultados observados para recomendar renovación, cambio de fase o cierre formal.

### `RAX-15 — Seguimiento de Eventos y Métricas Operativas`
- **Archivo**: `workflows/n8n/RAX-15-operational-metrics.json`
- **Tipo**: Asíncrono.
- **Activador**: Eventos de auditoría de IA.
- **Propósito**: Consolida latencias, tokens y tasas de aceptación humana de propuestas para medir el ahorro de tiempo real del mentor.

