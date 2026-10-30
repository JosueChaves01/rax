# Guía de Configuración y Despliegue de n8n para RAX

Esta guía describe los pasos necesarios para instalar, configurar y desplegar los workflows de n8n en un entorno local o de producción.

---

## 1. Variables de Entorno Requeridas

### En la Plataforma RAX (`.env.local`)
```bash
# Integración n8n
N8N_WEBHOOK_BASE_URL=https://n8n.tu-dominio.com/     # o http://localhost:5678/
RAX_N8N_SHARED_SECRET=tu-clave-secreta-hmac-32-chars # Secreto compartido para firmas HMAC
# Ambos switches se dejan desactivados hasta importar y verificar los flujos en staging.
RAX_N8N_EVENTS_ENABLED=false
RAX_N8N_MAIN_AGENT_ENABLED=false
```

No actives estos switches por tener una URL configurada. RAX-01, callbacks, persistencia y ejecución de herramientas deben pasar primero las pruebas de staging descritas en [main-agent-plan.md](../main-agent-plan.md).

### En la Instancia de n8n
Configura estas variables en el entorno donde corre n8n (Docker, docker-compose o n8n Cloud):

```bash
# Conectividad con la API de RAX
RAX_API_URL=https://app.tu-dominio.com               # URL pública del backend de RAX
RAX_N8N_SHARED_SECRET=tu-clave-secreta-hmac-32-chars # Misma clave compartida que en RAX
NEXT_PUBLIC_APP_URL=https://app.tu-dominio.com       # Para cabecera HTTP-Referer en OpenRouter

# Modelos OpenRouter
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

---

## 2. Configuración de Credenciales en n8n

### Secretos del proveedor
Los exports actuales leen `$env.OPENROUTER_API_KEY` y `$env.OPENROUTER_MODEL`; no están enlazados a la credencial de Header Auth que ofrecía una versión anterior de esta guía. Configura esos valores en el gestor de secretos/entorno de n8n y valida los permisos de lectura de variables para Code nodes. No pegues claves en el editor del workflow ni en el repositorio. Las credenciales solo se consideran verificadas tras una ejecución de staging con una cuenta de prueba.

---

## 3. Importación de Workflows

Para importar los 19 workflows sin reconstruirlos manualmente:

### Opción A: Desde la Interfaz Web de n8n
1. Entra a tu panel de n8n (`http://localhost:5678` o tu URL en producción).
2. Haz clic en **Workflows → Import from File**.
3. Selecciona los archivos de la carpeta `workflows/n8n/` del repositorio:
   - `RAX-00-health-check.json`
   - `RAX-01-event-ingress.json`
   - `RAX-02-mentor-chat.json`
   - `RAX-03-context-memory.json`
   - `RAX-04-diagnosis.json`
   - `RAX-05-session-preparation.json`
   - `RAX-06-session-synthesis.json`
   - `RAX-07-goals-action-plan.json`
   - `RAX-08-task-proposals.json`
   - `RAX-09-next-intervention.json`
   - `RAX-10-accountability-reminders.json`
   - `RAX-11-resource-recommendations.json`
   - `RAX-12-experiment-design.json`
   - `RAX-13-evidence-analysis.json`
   - `RAX-14-cycle-evaluation.json`
   - `RAX-15-operational-metrics.json`
   - `RAX-90-error-handler.json`
   - `RAX-91-controlled-reprocessing.json`
   - `RAX-99-ai-evaluation.json`
4. **No actives los workflows todavía.** Los JSON actuales incluyen rutas declaradas no operativas (RAX-01, RAX-91), callbacks no idempotentes y subflujos que aún no están conectados al agente. Importarlos en una instancia no los deja listos para producción.

### Opción B: Mediante n8n CLI (en servidor auto-hospedado)
```bash
n8n import:workflow --input=workflows/n8n/
```

---

## 4. Verificación de Instalación

Tras importar en un entorno de staging aislado, completar los contratos y habilitar workflows individualmente:
1. Envía una petición GET al webhook de diagnóstico:
   ```bash
   curl -i https://n8n.tu-dominio.com/webhook/rax-health
   ```
2. El health check solo acredita que responde el webhook de salud. No demuestra que OpenRouter, callbacks, persistencia ni las herramientas del agente funcionen.
3. Mantén `RAX_N8N_EVENTS_ENABLED=false` y `RAX_N8N_MAIN_AGENT_ENABLED=false` hasta que RAX-01, RAX-02, subflujos, callbacks firmados y persistencia pasen las pruebas sintéticas de [main-agent-plan.md](../main-agent-plan.md).

