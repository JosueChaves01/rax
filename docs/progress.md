# Progreso

Estados: PLANNED · IN_PROGRESS · IMPLEMENTED · PARTIAL · BLOCKED · DEPRECATED. Un estado IMPLEMENTED significa que hay código y prueba o verificación manual; no significa listo para producción.

Última actualización: 2026-10-29.

## Funcionalidades

| Área | Estado | Evidencia / nota |
|---|---|---|
| Landing con identidad visual | IMPLEMENTED | `app/page.tsx` |
| Cuentas reales (Supabase Auth) | IMPLEMENTED | `/entrar`, `/auth/callback`, `middleware.ts`; sin verificación en vivo contra Supabase desde el entorno de desarrollo |
| Onboarding por tipo de persona | IMPLEMENTED | `/bienvenida`, `tests/onboarding.test.ts` |
| Postulación y aprobación de mentores | IMPLEMENTED | `/app/admin`, `tests/onboarding.test.ts`, RLS |
| Modo DEMO | DEPRECATED | Eliminado; los datos de prueba viven solo en `tests/fixtures` |
| Proyectos (crear, pausar, compartir conversación) | IMPLEMENTED | `lib/services/projects.ts` |
| Entrevista guiada (9 dimensiones) | IMPLEMENTED | Escenarios A, B |
| Estructuración con trazabilidad | IMPLEMENTED | Escenarios A–D |
| Revisión humana del diagnóstico + historial | IMPLEMENTED | Escenario C, H |
| Resumen y confirmación | IMPLEMENTED | `diagnosis.ts` |
| Asignación de mentores | IMPLEMENTED | `/app/admin` |
| **Relaciones de mentoría y compatibilidad (Etapa 1)** | IMPLEMENTED | `lib/services/mentorship-relation.ts`, `tests/mentorship-relation.test.ts` (Escenario A) |
| **Acuerdos de mentoría formales versionados (Etapa 2/3)** | IMPLEMENTED | `lib/services/mentorship-relation.ts`, `app/app/p/[id]/acuerdos`, `tests/mentorship-relation.test.ts` (Escenario B) |
| **Objetivos de mentoría con línea base documentada** | IMPLEMENTED | `lib/services/mentorship-relation.ts`, `app/app/p/[id]/acuerdos`, `tests/mentorship-relation.test.ts` (Escenario B) |
| **Asistente de IA para sugerencia de objetivos y acuerdos** | IMPLEMENTED | `lib/ai/openrouter.ts`, `lib/ai/simulated.ts`, `tests/mentorship-relation.test.ts` (Escenario C) |
| **UI de Acuerdos y Objetivos en Workspace** | IMPLEMENTED | `/app/p/[id]/acuerdos`, navegación en etapa "Orientar" |
| **Hitos de Hoja de Ruta (`RoadmapMilestones`) (Etapa 4)** | IMPLEMENTED | `lib/services/roadmap.ts`, `app/app/p/[id]/tareas`, `tests/roadmap-multimodal.test.ts` (Escenario D1) |
| **Acciones Multimodales sin experimentos forzados (Etapa 4)** | IMPLEMENTED | `lib/services/validation.ts`, `types/domain.ts`, `app/app/p/[id]/tareas`, `tests/roadmap-multimodal.test.ts` (Escenario D2) |
| **Accountability no punitivo y diagnóstico de causas (Etapa 6)** | IMPLEMENTED | `lib/services/roadmap.ts`, `DelayHypothesis`, modal en `task-board.tsx`, `tests/roadmap-multimodal.test.ts` (Escenario D3) |
| **Ciclo de sesiones, briefing contextual y privacidad (Etapa 5)** | IMPLEMENTED | `tests/mentorship-lifecycle.test.ts`, `tests/mentoring-ai.test.ts`, `briefing.ts` |
| **Evaluación de resultados, cierre y renovación (Etapa 7)** | IMPLEMENTED | `tests/mentorship-lifecycle.test.ts` (Escenario I Global, preservación histórica) |
| **Integración n8n + OpenRouter (Catálogo RAX-00..RAX-99)** | IMPLEMENTED | 19 workflows en `workflows/n8n/`, contratos Zod en `lib/n8n/contracts.ts`, endpoints `/api/n8n/*`, HMAC en `lib/n8n/security.ts`, tests en `tests/n8n/` |


## Punto de continuación (Plan Swarm)

1. **Fase 4:** Ciclo de sesiones de mentoría (briefing pre-sesión con 4 capas de memoria, notas en vivo, resumen pos-sesión con compromisos y privacidad entre notas privadas/compartidas).
2. **Fase 5:** Productividad del mentor (cartera de clientes, priorización de intervenciones y alertas tempranas de riesgo de abandono).
3. **Fase 6:** Evaluación, cierre de ciclo o renovación con reporte longitudinal.
