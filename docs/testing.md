# Pruebas

## Qué hay y cómo correrlo

| Comando | Qué prueba | Resultado al 2026-10-28 |
|---|---|---|
| `npm test` | vitest: escenarios A–H, reglas de dominio, semilla DEMO | 17 pruebas pasando |
| `npm run typecheck` | TypeScript estricto | sin errores |
| `npm run build` | build de Next.js con lint | correcto |
| `npm run test:db` | migraciones + 30 comprobaciones de RLS/triggers en Postgres 16 | todas pasando |

`test:db` necesita `psql` y variables `PGHOST`/`PGPORT`/`PGUSER` hacia un Postgres donde se pueda crear la base `rax_test`. Usa `supabase/tests/00_local_stubs.sql`, que imita lo mínimo de Supabase (`auth.users`, `auth.uid()`, roles, `storage`). No es el entorno real de Supabase: conviene repetir las comprobaciones con `supabase start` antes de producción.

## Escenarios (tests/scenarios.test.ts)

| | Escenario | Verifica |
|---|---|---|
| A | Entrevista completa | Cada respuesta se archiva con cita y dimensión; aparece el borrador de resumen |
| B | "No sé" y respuesta mixta | Pregunta abierta para lo desconocido, afirmación para lo dicho |
| C | Corrección humana | La edición de una interpretación pasa a `human_correction`; historial con antes/después; la IA no la pisa |
| D | Contradicción | Se crea "necesita aclaración", lo confirmado no cambia |
| E | Mentoría y validación | Solo el mentor asignado aprueba; criterios bloqueados; resultado actualiza la hipótesis; segunda revisión |
| F | Aislamiento | Otro emprendedor y un mentor no asignado reciben `not_found`; se audita `access.denied` |
| G | Fallo de la IA | El mensaje se guarda, se informa el error, no hay respuesta inventada; OpenRouter con JSON inválido reintenta y falla limpio |
| H | Concurrencia | Una edición con versión vieja recibe conflicto |

## Verificación manual

Recorrido con Playwright (Chromium) en escritorio y móvil: landing, entrar, conversación, diagnóstico, mentoría, validación, tareas, historial, administración. Sin errores de consola.

## Lo que no está probado

- OpenRouter contra la API real (solo con `fetch` simulado).
- La app conectada a Supabase (el adaptador no existe aún).
- Pruebas end-to-end automatizadas en CI.
- Accesibilidad con lector de pantalla.
- Carga y rendimiento.
