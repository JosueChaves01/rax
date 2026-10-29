# Operaciones, Resiliencia y Reprocesamiento

Este documento establece las directrices operativas para monitorear, resolver incidentes y reprocesar eventos en los workflows de n8n integrados con RAX.

---

## 1. Clasificación y Manejo de Errores (`RAX-90`)

El workflow `RAX-90` intercepta cualquier fallo no controlado mediante el nodo `Error Trigger`:

### Errores Transitorios (Recoverable: true)
- **Causas**: Códigos HTTP 429 (Rate Limit de OpenRouter), 503 (Servicio no disponible), 504 (Gateway Timeout), errores de conexión de red (`ECONNRESET`, `ETIMEDOUT`).
- **Acción**:
  - `RAX-90` etiqueta el incidente como `transient`.
  - Se reporta a RAX para que el sistema sepa que la tarea está pendiente.
  - El operador o un sub-proceso puede ejecutar reintentos con backoff exponencial.

### Errores Permanentes (Recoverable: false)
- **Causas**: Códigos HTTP 400 (Bad Request), errores de esquema JSON irrecuperables, fallos de autenticación (HMAC inválido), IDs de proyecto no encontrados.
- **Acción**:
  - `RAX-90` clasifica el incidente como `permanent`.
  - Se notifica a los desarrolladores y se registra en `audit_events` de RAX con `action = 'ai.failed'`.
  - No se reintenta automáticamente para evitar bucles infinitos.

---

## 2. Reprocesamiento Controlado (`RAX-91`)

Cuando un evento falla o se requiere regenerar un análisis:

1. **Requisitos**:
   - Solo usuarios con rol `admin` o identidades de servicio autenticadas pueden invocar `RAX-91`.
   - Se debe proporcionar el `correlationId` original y el motivo del reprocesamiento.

2. **Invocación**:
   ```bash
   curl -X POST https://n8n.tu-dominio.com/webhook/rax-reprocess \
     -H "Content-Type: application/json" \
     -H "x-rax-signature: sha256=<hmac>" \
     -H "x-rax-timestamp: <timestamp>" \
     -d '{
       "actor": { "id": "admin_usr_01", "role": "admin" },
       "correlationId": "corr_ses_123",
       "targetWorkflow": "RAX-06",
       "reason": "Regeneración por notas corregidas del mentor",
       "originalEvent": { ... }
     }'
   ```

3. **Garantías**:
   - Se genera un nuevo `reprocessCorrelationId` (`corr_ses_123_re_1730000000`).
   - El historial anterior se conserva intacto en la auditoría de RAX.
   - No se duplican tareas ni acuerdos confirmados.

---

## 3. Monitoreo y Métricas (`RAX-15`)

`RAX-15` recolecta métricas operativas clave para responder:
- ¿Cuánto tiempo de redacción y preparación ahorra la IA al mentor?
- ¿Cuál es la tasa de aceptación humana de las propuestas generadas?
- ¿Cuál es el consumo de tokens y coste acumulado por modelo?

Todas las métricas se agregan sin almacenar contenido sensible de conversaciones ni PII.

