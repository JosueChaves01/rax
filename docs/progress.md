# Progreso

Estados: PLANNED · IN_PROGRESS · IMPLEMENTED · PARTIAL · BLOCKED · DEPRECATED. Un estado IMPLEMENTED significa que hay código y prueba o verificación manual; no significa listo para producción.

Última actualización: 2026-10-28.

## Funcionalidades

| Área | Estado | Evidencia / nota |
|---|---|---|
| Landing con identidad visual | IMPLEMENTED | `app/page.tsx` |
| Acceso por perfil DEMO | PARTIAL | Cookie DEMO; falta autenticación real |
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
| App conectada a Supabase | PLANNED | Falta adaptador Repository + Auth |
| Subida a Storage | PLANNED | Bucket y políticas listos |
| Rate limiting | PLANNED | |
| Notificaciones | PLANNED | |
| CI | PLANNED | |

## Punto de continuación

1. Crear proyecto Supabase, `supabase db push`, y correr `test:db` contra `supabase start`.
2. Implementar `lib/data/supabase-repository.ts` y elegirlo en `lib/runtime.ts` si hay variables de Supabase.
3. Reemplazar `/entrar` por Supabase Auth (correo con enlace mágico) manteniendo el modo DEMO solo en desarrollo.
4. Poner `OPENROUTER_API_KEY`, probar con el modelo gratuito y ajustar prompt/modelo si el JSON falla.
5. Subida de archivos a Storage con URL firmada.
6. Rate limiting en `sendMessage` y CI con `npm run check`.
