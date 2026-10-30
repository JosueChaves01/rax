# Guía de Pruebas y Aceptación de Workflows n8n

> **Estado real:** esta matriz es una especificación objetivo heredada, no evidencia de ejecución. Las pruebas locales validan contratos y estructura JSON, pero no ejecutan n8n, OpenRouter, callbacks ni PostgreSQL. Ningún caso de integración real está verificado todavía.

Este documento detalla la verificación de las 12 pruebas de aceptación requeridas por la especificación del proyecto RAX.

---

## 1. Suite de Pruebas Automatizadas

En el repositorio se ejecutan pruebas unitarias y de integración para validar la seguridad HMAC, los contratos Zod y la integridad estructural de los 19 workflows JSON:

```bash
npm test
```

Salida esperada:
- `tests/n8n/integration.test.ts`: 7 pruebas (HMAC válido, rechazo por timestamp caducado, rechazo por firma alterada, validación de eventos canónicos, obligatoriedad de aprobación humana).
- `tests/n8n/workflows.test.ts`: 21 pruebas (existencia de los 19 archivos, validación estructural de nodos y conexiones de n8n v1+, ausencia de secretos hardcodeados).

---

## 2. Matriz de Resultados de las 12 Pruebas de Aceptación

| Prueba | Workflow Involucrado | Datos de Entrada Sintéticos | Resultado Esperado | Estado |
|---|---|---|---|---|
| **Prueba 1 — Chat** | `RAX-02` | Pregunta sobre definición de cliente objetivo | Respuesta contextualizada en español con preguntas de profundización. | ⏳ Pendiente de n8n staging |
| **Prueba 2 — Privacidad** | `RAX-02` | Actor rol `entrepreneur` con petición que incluye notas de mentor | Notas privadas del mentor purgadas en el nodo Code antes de llamar a OpenRouter. | ⏳ Pendiente de n8n staging |
| **Prueba 3 — Sesión** | `RAX-05` | Evento `session.scheduled` con objetivos y notas previas | Generación de `MentorBriefing` con agenda estructurada y preguntas sugeridas. | ⏳ Pendiente de verificación en staging |
| **Prueba 4 — Síntesis** | `RAX-06` | Notas de sesión con acuerdos y tareas ambiguas | Tareas propuestas con cita textual de respaldo (`sourceQuote`); campos no dichos marcados como desconocidos. | ⏳ Pendiente de verificación en staging |
| **Prueba 5 — Seguimiento** | `RAX-09` / `RAX-10` | Compromiso con fecha vencida | Borrador de recordatorio para la bandeja del mentor; cero envíos externos no autorizados. | ⏳ Pendiente de verificación en staging |
| **Prueba 6 — Experimento** | `RAX-13` | Criterio ex-ante (15 registros) vs observado (6 registros) | Clasificación estricta en `weakened` o `inconclusive` sin maquillar resultados negativos. | ⏳ Pendiente de verificación en staging |
| **Prueba 7 — Cierre** | `RAX-14` | Diagnóstico inicial vs resultados actuales | Evaluación comparativa y propuesta de renovación o avance sin sobreescribir datos históricos. | ⏳ Pendiente de verificación en staging |
| **Prueba 8 — Fallo OpenRouter** | `RAX-90` | Simulación de error HTTP 429 de OpenRouter | Clasificado como error transitorio con reintentos controlados; la app no pierde datos. | ⏳ Pendiente de verificación en staging |
| **Prueba 9 — Salida Inválida** | `RAX-02..14` | Salida de texto plano no conforme a JSON | Bloque try/catch captura el error y devuelve un fallback seguro con incertidumbre registrada. | ⏳ Pendiente de verificación en staging |
| **Prueba 10 — Evento Duplicado** | `RAX-01` | Mismo `eventId` recibido dos veces | Detección de duplicado y respuesta 202 sin ejecutar sub-workflows repetidos. | ⏳ Pendiente de implementación y staging |
| **Prueba 11 — Reprocesamiento** | `RAX-91` | Solicitud administrativa con `originalCorrelationId` | Nuevo `correlationId` asignado, re-enrutamiento seguro y registro de motivo. | ⏳ Pendiente de verificación en staging |
| **Prueba 12 — Integración Real** | `RAX-01..15` | Callback hacia `/api/n8n/callback` con HMAC | Propuesta persistida, idempotente y revisable tras callback firmado. | ⏳ Pendiente de implementación y staging |

---

## 3. Ejecución de la Suite Sintética en n8n (`RAX-99`)

Para ejecutar la verificación completa dentro de la instancia de n8n:
1. Envía un `POST` al webhook de evaluación:
   ```bash
   curl -X POST https://n8n.tu-dominio.com/webhook/rax-run-eval-suite
   ```
2. La suite procesará los 12 casos y responderá con el informe consolidado:
   ```json
   {
     "suiteName": "RAX Acceptance Test Suite (12 Casos)",
     "totalTests": 12,
     "passed": 12,
     "failed": 0
   }
   ```

