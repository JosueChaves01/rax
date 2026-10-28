# RAX · Fase Cero

RAX ayuda a emprendedores a pasar de una idea confusa a un diagnóstico ordenado, hipótesis comprobables y experimentos con criterios fijados de antemano. La IA estructura lo que la persona dice (no inventa), y un mentor humano revisa desde el inicio: primera revisión del diagnóstico y segunda revisión de los resultados.

> **Estado: prototipo funcional, no listo para producción.** Corre con datos DEMO en memoria y acceso de demostración (sin autenticación real). Las migraciones de Supabase están escritas y probadas en Postgres local, pero la app todavía no las usa. Ver [docs/progress.md](docs/progress.md).

## Qué se puede hacer hoy

- Entrar como emprendedora, mentora o administración (perfiles DEMO) en `/entrar`.
- Conversar: entrevista guiada por 9 dimensiones; cada respuesta se archiva como elementos del diagnóstico con su cita literal, tipo de información y estado de revisión.
- Diagnóstico: confirmar, corregir, rechazar con motivo, pedir aclaración, marcar como desconocido, priorizar problemas; historial de versiones por elemento y control de concurrencia.
- Mentoría: briefing automático, notas, primera revisión, segunda revisión con decisión justificada.
- Validación: hipótesis con chequeo de vaguedad, aprobación solo por el mentor asignado, experimentos cuyos criterios se bloquean al iniciar, resultados que actualizan la hipótesis.
- Tareas, evidencias (nota, enlace, archivo con límites) e historial auditado.
- Administración: asignar y revocar mentores; ve metadatos, no contenido.

## Ejecutar en local

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env.local   # opcional: sin clave se usa la simulación
npm run dev                  # http://localhost:3000
```

Sin `OPENROUTER_API_KEY` la IA es una **simulación determinista**, y la interfaz lo dice en cada respuesta. Con la clave se usa OpenRouter con un modelo gratuito (por defecto `meta-llama/llama-3.3-70b-instruct:free`, configurable con `OPENROUTER_MODEL`).

## Comprobaciones

```bash
npm run check     # typecheck + lint + pruebas (vitest)
npm test          # solo pruebas: escenarios A–H, reglas y semilla DEMO
npm run test:db   # migraciones + RLS sobre un Postgres vacío (requiere psql y PG* en el entorno)
npm run build
```

## Variables de entorno

| Variable | Dónde | Uso |
|---|---|---|
| `OPENROUTER_API_KEY` | solo servidor | Activa OpenRouter. Vacía = simulación. |
| `OPENROUTER_MODEL` | solo servidor | Id de modelo; por defecto uno `:free`. |
| `NEXT_PUBLIC_APP_URL` | público | Se envía como `HTTP-Referer` a OpenRouter. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | — | Reservadas; la app aún no las lee. |

## Conectar Supabase

Las migraciones de `supabase/migrations/` crean tablas, enumerados, triggers de integridad, RLS en todas las tablas y el bucket privado `evidence`.

```bash
supabase link --project-ref <ref>
supabase db push
```

Falta el adaptador `Repository` sobre Supabase y la autenticación real; ver [docs/architecture.md](docs/architecture.md#persistencia) y [docs/progress.md](docs/progress.md).

## Documentación

- [Contexto de producto](docs/product-context.md) · [Flujos](docs/user-flows.md) · [Modelo de dominio](docs/domain-model.md)
- [Arquitectura](docs/architecture.md) · [Comportamiento de la IA](docs/ai-behavior.md) · [Seguridad](docs/security.md)
- [Pruebas](docs/testing.md) · [Progreso](docs/progress.md) · [Decisiones](docs/decisions/)

## Estructura

```
app/                rutas (landing, /entrar, /app, /app/p/[id]/…) y server actions
features/           reglas de dominio puras (entrevista, diagnóstico, hipótesis, experimentos, mentoría, fase)
lib/services/       casos de uso con autorización en servidor y auditoría
lib/data/           puerto Repository, implementación en memoria y semilla DEMO
lib/ai/             proveedor simulado, OpenRouter, esquema, prompt, contexto y reglas de aplicación
lib/validation/     esquemas zod de toda entrada de usuario
supabase/           migraciones y pruebas de RLS
tests/              escenarios A–H y reglas
docs/               documentación y decisiones
```

## Capturas

Tomadas del build de producción con datos DEMO y la IA simulada.

| Landing | Diagnóstico | Mentoría | Móvil |
|---|---|---|---|
| ![Landing](docs/screenshots/landing.png) | ![Diagnóstico](docs/screenshots/diagnostico.png) | ![Mentoría](docs/screenshots/mentoria.png) | ![Móvil](docs/screenshots/movil-conversacion.png) |
