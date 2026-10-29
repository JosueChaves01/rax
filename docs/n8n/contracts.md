# Contratos de Integración y Esquemas JSON

Todos los intercambios entre RAX y n8n siguen contratos estrictos definidos en TypeScript y validados mediante Zod en `lib/n8n/contracts.ts`.

---

## 1. Contrato Canónico de Evento: RAX → n8n

Emitido por RAX ante cualquier suceso relevante para la capa de IA.

```typescript
export interface RaxEvent {
  eventId: string;          // UUID o prefijo identificador único
  eventType: string;        // Tipo de evento (ej: 'session.completed')
  occurredAt: string;       // Fecha ISO 8601
  schemaVersion: "1.0.0";   // Versión del contrato
  correlationId: string;    // ID para trazabilidad end-to-end
  actor: {
    id: string;             // ID del usuario o 'system'
    role: "entrepreneur" | "mentor" | "admin" | "system";
    verified: boolean;      // Verificado en servidor
  };
  relationshipId?: string;  // ID de la relación de mentoría
  projectId?: string;       // ID del proyecto
  entityType: string;       // 'session' | 'hypothesis' | 'diagnosis' | etc.
  entityId: string;         // ID de la entidad afectada
  payload: Record<string, unknown>; // Datos mínimos autorizados
  callback?: {
    url: string;            // Endpoint de respuesta en RAX
    token?: string;
  };
}
```

---

## 2. Contrato de Respuesta / Callback: n8n → RAX

Enviado por n8n hacia `POST /api/n8n/callback` al culminar el procesamiento cognitivo.

```typescript
export interface N8nCallbackPayload {
  operationId: string;      // ID único generado por n8n
  correlationId: string;    // El correlationId original de RAX
  workflowId: string;       // ID del workflow (ej: 'RAX-06')
  workflowVersion: string;  // Versión del workflow
  status: "completed" | "failed" | "rejected";
  executionTimeMs?: number; // Tiempo de ejecución en ms
  usage?: {
    model: string;          // Modelo de OpenRouter utilizado
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
  data?: {
    summary?: string;
    proposals: AiProposalItem[];
    rawOutput?: unknown;
    uncertainties: string[];
    nextStepRecommendation?: string;
  };
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    providerStatus?: number;
  } | null;
}
```

---

## 3. Contrato de Elemento de Propuesta (`AiProposalItem`)

Cualquier propuesta generada por IA sigue esta estructura para garantizar que ninguna acción se ejecute sin intervención humana.

```typescript
export interface AiProposalItem {
  type: 
    | "task"
    | "diagnosis_item"
    | "hypothesis"
    | "experiment"
    | "goal"
    | "recommendation"
    | "intervention"
    | "agenda_topic";
  title: string;
  description?: string;
  category?: string;
  ownerSuggestion?: string;
  dueDateSuggestion?: string;
  successCriteria?: string;
  evidenceRequired?: string;
  sourceQuote?: string;          // Cita textual obligatoria de la fuente
  sourceEntityType?: string;
  sourceEntityId?: string;
  needsHumanApproval: true;      // FORZADO EN CÓDIGO
  uncertainties: string[];
  metadata?: Record<string, unknown>;
}
```

---

## 4. Contrato de Chat Síncrono (`RAX-02`)

### Solicitud (RAX → n8n)
```typescript
export interface ChatSyncRequest {
  correlationId: string;
  projectId: string;
  relationshipId?: string;
  actor: EventActor;
  messageId: string;
  message: string;
  context: {
    projectName: string;
    projectSummary?: string | null;
    recentMessages: Array<{ author: string; content: string; createdAt: string }>;
    currentItems: unknown[];
    coveredDimensions: string[];
    pendingDimensions: string[];
    mentorNotes: string[]; // Solo presente si el actor es mentor/admin
  };
}
```

### Respuesta (n8n → RAX)
```typescript
export interface ChatSyncResponse {
  correlationId: string;
  reply: string;
  dimension?: string;
  proposals: AiProposalItem[];
  uncertainties: string[];
  usage?: AiUsage;
}
```

