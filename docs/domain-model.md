# Modelo de dominio

Tipos en `types/domain.ts`; tablas equivalentes (snake_case, ids uuid) en `supabase/migrations/20261028000001_rax_core.sql`.

## Entidades

| Entidad | Propósito | Notas |
|---|---|---|
| Profile | Persona y su rol (`entrepreneur`, `mentor`, `admin`) | `mentorStatus` (none/pending/approved/rejected), `onboarding` (respuestas según el tipo), `onboardedAt`. El rol y la aprobación de mentores solo los cambia la administración |
| Project | Iniciativa del emprendedor | `shareConversationWithMentor`, `status` (active/paused/archived) |
| ProjectMember | Dueño o colaborador | El dueño se crea al crear el proyecto |
| MentorAssignment | Mentor asignado a un proyecto | `active` / `revoked`; la revocación conserva la fila |
| Conversation, Message | Entrevista | `Message.provider` (simulated/openrouter) y `dimension` preguntada |
| Diagnosis | Resumen del proyecto | `summaryConfirmedAt/By`; editar el resumen anula la confirmación |
| DiagnosisItem | Unidad de información | Ver abajo |
| DiagnosisItemHistory | Versión completa antes/después de cada cambio | Solo se agrega, nunca se edita |
| Comment | Comentario sobre elemento, hipótesis o experimento | |
| MentorSession | Primera o segunda revisión | `briefing`, `decision` + justificación |
| SessionNote | Nota del mentor | observation / question / suggestion / agreement |
| Hypothesis | Supuesto comprobable | 9 estados (abajo) |
| Experiment | Prueba de una hipótesis | Criterios bloqueados al iniciar (`criteriaLockedAt`) |
| ExperimentResult | Lo observado | outcome + aprendizajes + limitaciones + evidencias |
| Task | Trabajo concreto | Opcionalmente ligada a un experimento |
| Evidence | Nota, enlace o archivo | Archivo: ≤10 MB, tipos permitidos |
| AuditEvent | Registro de acciones | Nunca guarda secretos ni contenido completo de prompts |

## DiagnosisItem: trazabilidad

- **category**: context, people_market, problem, solutions, financial, operational, commercial, legal, risk, open_question.
- **infoType** (de dónde sale la información): `entrepreneur_statement`, `documented_observation`, `verifiable_evidence`, `ai_interpretation`, `hypothesis`, `human_correction`, `unknown`, `agreed_decision`.
- **reviewStatus**: `proposed`, `confirmed`, `corrected`, `rejected`, `needs_clarification`.
- **uncertainty**: low, medium, high, unknown.
- **source**: kind (conversation, entrepreneur_edit, mentor, ai, evidence, experiment), `sourceRefId` (p. ej. el mensaje) y `sourceQuote` (cita literal).
- **version**: sube en cada cambio; las escrituras con `expectedVersion` distinta fallan con conflicto.
- **priority**: solo en problemas, con justificación y autor.

Reglas clave (`features/diagnosis/rules.ts`):
- Editar una `ai_interpretation` la convierte en `human_correction` con estado `corrected`.
- Rechazar y pedir aclaración exigen motivo.
- La IA solo puede modificar elementos propuestos por ella y sin revisión humana (`aiMayModify`).
- Lo rechazado no se vuelve a proponer.

Estado del diagnóstico (derivado en `deriveDiagnosisStatus`): `exploring → pending_review → reviewed → ready_for_prioritization → ready_for_experiments`, según el resumen, los elementos pendientes y la primera revisión.

## Hipótesis

`draft → pending_approval → approved → testing → supported | weakened | inconclusive`, y en cualquier punto previo a cerrar: `reformulated` (crea una nueva que la reemplaza) o `discarded`.

- `hypothesisIssues` exige un enunciado de al menos 25 caracteres, sin fórmulas vagas de éxito general, con segmento y criterio de evaluación.
- Solo el mentor asignado pasa a `approved`.
- Resultado → hipótesis: positive → supported, negative → weakened, mixed/inconclusive → inconclusive.

## Experimento

`design → ready → running → results_pending → reviewed`.

- Para `ready` deben estar pregunta, método, participantes o fuentes, métrica, criterio de éxito, criterio de rechazo y evidencia a recopilar.
- Al iniciar se fija `criteriaLockedAt`; desde ahí métrica y criterios no cambian (también en la base de datos).
- La segunda revisión del mentor marca los experimentos como `reviewed`.
