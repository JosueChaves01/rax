# Progreso

Estados: PLANNED · IN_PROGRESS · IMPLEMENTED · PARTIAL · BLOCKED · DEPRECATED. Un estado IMPLEMENTED significa que hay código y prueba o verificación manual; no significa listo para producción.

Última actualización: 2026-10-28.

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
| Primera y segunda revisión | IMPLEMENTED | Escenario E |
| Hipótesis con aprobación del mentor | IMPLEMENTED | Escenario E, RLS |
| Experimentos con criterios bloqueados | IMPLEMENTED | Escenario E, RLS |
| Tareas | IMPLEMENTED | `/tareas` |
| Evidencias nota/enlace | IMPLEMENTED | `/historial` |
| Evidencias archivo | PARTIAL | Se validan metadatos; no hay subida real |
| Auditoría | IMPLEMENTED | `audit_events`, `/historial` |
| IA simulada | IMPLEMENTED | Etiquetada en la interfaz |
| IA OpenRouter (modelo gratuito) | PARTIAL | Código y pruebas con fetch simulado; sin verificación en vivo |
| Migraciones Supabase + RLS | IMPLEMENTED | `npm run test:db` en Postgres local con stubs |
| App conectada a Supabase | IMPLEMENTED | `lib/data/supabase-repository.ts`; `npm run test:pg` corre los escenarios contra Postgres con RLS |
| Subida a Storage | PLANNED | Bucket y políticas listos |
| Rate limiting | PLANNED | |
| Notificaciones | PLANNED | |
| CI | PLANNED | |

## Punto de continuación

1. Aplicar `20261028000004_rax_onboarding.sql`, poner las variables de entorno y configurar las URLs de Auth (ver README).
2. Recorrer el flujo completo en el proyecto real: registro, confirmación de correo, onboarding de cada tipo, aprobación de un mentor, asignación y conversación.
3. Recuperación de contraseña y cambio de correo.
4. Subida de archivos a Storage con URL firmada.
5. Rate limiting en `sendMessage` y CI con `npm run check` + `test:pg`.
6. SMTP propio para los correos de Auth.
