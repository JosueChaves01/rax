# Catálogo de Eventos Emitidos por RAX

Los eventos son emitidos por la capa de servicios de RAX hacia el webhook de ingesta `RAX-01` (`POST /webhook/rax-events`).

| Evento | Origen en RAX | Workflow Destino en n8n | Propósito |
|---|---|---|---|
| `session.scheduled` | `lib/services/mentoring.ts` | `RAX-05-session-preparation` | Generar la agenda preliminar y el briefing del mentor. |
| `session.notes_submitted` | `lib/services/mentoring.ts` | `RAX-06-session-synthesis` | Extraer tareas, acuerdos y retroalimentación de las notas. |
| `interview.response_received` | `lib/services/conversation.ts` | `RAX-04-diagnosis` | Mapear hallazgos a los elementos del diagnóstico. |
| `mentorship.agreement_drafted` | `lib/services/mentorship-relation.ts` | `RAX-07-goals-action-plan` | Traducir acuerdos preliminares en objetivos SMART. |
| `hypothesis.draft_requested` | `lib/services/validation.ts` | `RAX-12-experiment-design` | Diseñar hipótesis falsables y experimentos ex-ante. |
| `experiment.result_submitted` | `lib/services/validation.ts` | `RAX-13-evidence-analysis` | Comparar resultados observados contra criterios bloqueados. |
| `mentorship.evaluation_requested` | `lib/services/mentorship-relation.ts` | `RAX-14-cycle-evaluation` | Analizar el balance de la etapa y sugerir continuidad. |
| `conversation.batch_completed` | `lib/services/conversation.ts` | `RAX-03-context-memory` | Consolidar la memoria contextual tras un lote de interacciones. |
| `alert.stalled_progress` | Cron / Trigger de integridad | `RAX-09-next-intervention` | Señalar estancamiento o compromisos sin avance. |

---

## Estructura de Encabezados de Red

Toda transmisión de eventos desde RAX hacia n8n incluye las siguientes cabeceras:

- `Content-Type: application/json`
- `x-rax-signature: sha256=<hex_hmac>`
- `x-rax-timestamp: <epoch_seconds>`
- `x-rax-correlation-id: <correlation_id>`

