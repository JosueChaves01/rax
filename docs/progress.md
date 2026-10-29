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
| **Ciclo de sesiones con briefing 4-capas y privacidad dual (Etapa 4)** | IMPLEMENTED | `lib/services/mentoring.ts`, `/app/p/[id]/orientar`, `tests/mentorship-sessions.test.ts` (Escenarios E1–E3) |
| **Productividad del mentor y cartera de clientes (Fase 5)** | IMPLEMENTED | `lib/services/portfolio.ts`, `/app/mentor`, `tests/mentor-portfolio.test.ts` (Escenarios F1–F2) |
| **Biblioteca de recursos y recomendación contextual (Fase 5)** | IMPLEMENTED | `lib/services/resources.ts`, `/app/mentor/recursos`, `tests/mentor-resources.test.ts` (Escenarios G1–G3) |
| **Evaluación de resultados, cierre y renovación (Fase 6)** | IMPLEMENTED | `lib/services/evaluation.ts`, `/app/p/[id]/evaluacion`, `tests/cycle-evaluation.test.ts` (Escenarios H1–H2) |
| **Integración n8n + OpenRouter (Catálogo RAX-00..RAX-99)** | IMPLEMENTED | 19 workflows en `workflows/n8n/`, contratos Zod en `lib/n8n/contracts.ts`, endpoints `/api/n8n/*`, HMAC en `lib/n8n/security.ts`, tests en `tests/n8n/` |

## Resumen del Swarm de Implementación
- **Fase 0 (Auditoría):** Completada.
- **Fase 1 (Fundamentos y Relación de Mentoría):** Completada y verificada.
- **Fase 2 (Exploración, Diagnóstico y Acuerdos):** Completada y verificada.
- **Fase 3 (Hoja de Ruta y Ejecución Multimodal):** Completada y verificada.
- **Fase 4 (Sesiones, Chat y Memoria Contextual):** Completada y verificada.
- **Fase 5 (Productividad del Mentor: Cartera y Recursos):** Completada y verificada.
- **Fase 6 (Evaluación de Resultados, Cierre y Renovación):** Completada y verificada.
- **Fase 7 (Medición de Impacto, Instrumentación y Piloto):** Preparada para verificación y piloto con 81/81 pruebas automatizadas pasando.
