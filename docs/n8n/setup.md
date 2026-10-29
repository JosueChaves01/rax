# Guía de Configuración y Despliegue de n8n para RAX

Esta guía describe los pasos necesarios para instalar, configurar y desplegar los workflows de n8n en un entorno local o de producción.

---

## 1. Variables de Entorno Requeridas

### En la Plataforma RAX (`.env.local`)
```bash
# Integración n8n
N8N_WEBHOOK_BASE_URL=https://n8n.tu-dominio.com/     # o http://localhost:5678/
RAX_N8N_SHARED_SECRET=tu-clave-secreta-hmac-32-chars # Secreto compartido para firmas HMAC
```

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

### Credencial para OpenRouter
1. En el panel de n8n, navega a **Credentials → New Credential**.
2. Selecciona **Header Auth** (o usa el nodo OpenRouter oficial si está disponible en tu versión).
3. Configuración:
   - **Name**: `OpenRouter Header Auth`
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer sk-or-v1-tu-clave-real-aqui`
4. Guarda la credencial. Los nodos HTTP Request de los workflows `RAX-00` a `RAX-14` están configurados para referenciar esta credencial genérica sin exponer secretos en el código.

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
4. Activa los workflows haciendo clic en el switch **Active** en la esquina superior derecha de cada uno.

### Opción B: Mediante n8n CLI (en servidor auto-hospedado)
```bash
n8n import:workflow --input=workflows/n8n/
```

---

## 4. Verificación de Instalación

Una vez importados y activados:
1. Envía una petición GET al webhook de diagnóstico:
   ```bash
   curl -i https://n8n.tu-dominio.com/webhook/rax-health
   ```
2. Debes recibir una respuesta HTTP 200 con `{ "status": "healthy" }`, confirmando que n8n, la API de RAX y el modelo de OpenRouter se comunican correctamente.

