# Arquitectura de Integración: RAX ↔ n8n ↔ OpenRouter

> **Estado:** este documento describe una arquitectura objetivo, no una integración operativa. Los chats ya comparten la puerta y el almacenamiento del agente, pero RAX-02 todavía no invoca herramientas y no puede ejecutar los flujos especializados. La instancia n8n no está conectada/verificada. El alcance y los criterios de conexión están en [Plan del agente principal](../main-agent-plan.md). No mostrar “activo”, “ejecutado” ni “aceptado” hasta verificar la operación real.

## 1. Principio Fundamental

**RAX (Next.js 15 + Supabase) es la única fuente de verdad** del sistema: gobierna la autenticación, los permisos basados en roles (RLS), la persistencia de datos y las confirmaciones oficiales.

**n8n** opera como el motor de orquestación desacoplado y procesamiento de inteligencia artificial, invocando a **OpenRouter** para inferencia cognitiva.

```
┌─────────────────────────────────────────────────────────────┐
│                       Plataforma RAX                        │
│  - Next.js 15 (App Router, Server Actions, Server Comp.)    │
│  - Supabase Postgres con RLS (Auth, auditoría, versionado) │
│  - Módulo de Integración: lib/n8n y app/api/n8n/           │
└──────────────┬──────────────────────────────▲───────────────┘
               │                              │
   Webhook con firma HMAC             Callback con propuestas
   (Event Ingress / Chat)             (needsHumanApproval: true)
               │                              │
┌──────────────▼──────────────────────────────┴───────────────┐
│                    Orquestador n8n                          │
│  - RAX-01 Ingesta Segura & Idempotencia                     │
│  - Enrutamiento por tipo de evento                          │
│  - RAX-02 (Chat Síncrono)                                   │
│  - RAX-03..14 (Flujos Asíncronos Especializados)            │
│  - RAX-90 (Error Handler Centralizado)                      │
└──────────────┬──────────────────────────────▲───────────────┘
               │                              │
    Inferencia HTTP/JSON            Respuesta estructurada
    (Referer & X-Title)             (Nivel 1, 2 o 3)
               │                              │
┌──────────────▼──────────────────────────────┴───────────────┐
│                  Pasarela OpenRouter                        │
│  - Nivel 1: Modelos rápidos (clasificación y extracción)   │
│  - Nivel 2: Modelos contextuales (chat, sesiones, tareas)   │
│  - Nivel 3: Modelos de razonamiento (hipótesis, validación) │
└─────────────────────────────────────────────────────────────┘
```

## 2. Patrones de Comunicación

### A. Comunicación Síncrona (Tiempo Real)
- **Caso de uso**: Chat de mentoría (`RAX-02`).
- **Flujo**:
  1. Usuario envía un mensaje en la interfaz web de RAX.
  2. Server Action valida sesión en Supabase y empaqueta el contexto mínimo autorizado.
  3. `lib/n8n/dispatcher.ts` invoca `POST /webhook/rax-chat` firmado con HMAC.
  4. n8n ejecuta en modo síncrono (`Respond to Webhook`) con timeout de 35 segundos.
  5. Retorna la respuesta validada al Server Action, que la renderiza en el cliente.

### B. Comunicación Asíncrona (flujo objetivo; aún no operativo)
- **Uso previsto**: síntesis de sesión (`RAX-06`), preparación de agenda (`RAX-05`), diagnóstico (`RAX-04`), diseño de experimentos (`RAX-12`) y evaluación (`RAX-14`).
- **Estado actual**: el envío de eventos está desactivado por defecto. `RAX-01` no acepta eventos operativos y los sub-workflows todavía no están conectados al agente principal. El callback firmado solo registra metadatos de auditoría; no guarda propuestas de dominio.
- **Flujo objetivo una vez implementado y verificado en staging**:
  1. La aplicación registra un hito o acción de usuario.
  2. RAX emite un evento canónico firmado a `POST /webhook/rax-events`.
  3. `RAX-01` valida firma HMAC, ventana de tiempo, esquema e idempotencia.
  4. n8n enruta al sub-workflow autorizado.
  5. El sub-workflow valida su salida y hace un callback firmado a `POST /api/n8n/callback`.
  6. RAX persiste una propuesta revisable (`needsHumanApproval: true`) con autorización, idempotencia y trazabilidad.

Este flujo objetivo no debe interpretarse como una capacidad disponible hasta que se complete la implementación y la prueba de staging.

## 3. Seguridad de Red y Criptográfica

1. **Firma HMAC-SHA256**: Cada petición lleva cabeceras `x-rax-signature` y `x-rax-timestamp`. La firma se calcula sobre `${timestamp}.${body}` con el secreto compartido `RAX_N8N_SHARED_SECRET`.
2. **Protección Anti-Replay**: Peticiones con diferencia temporal superior a 300 segundos son descartadas de inmediato.
3. **Aislamiento RLS**: n8n nunca interactúa directamente con la base de datos de Supabase sin pasar por las capas autorizadas de RAX.
4. **Privacidad de Notas de Mentor**: Las notas privadas del mentor son purgadas del contexto si el actor de la petición es un emprendedor.

