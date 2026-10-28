# Arquitectura

## Visión general

Monolito Next.js 15 (App Router) en TypeScript estricto, con Supabase (Auth + Postgres) como único servicio obligatorio.

```
navegador ──► Server Components (lectura) ──► lib/services ──► Repository (puerto)
          └─► Server Actions (app/actions.ts)  │                 ├─ Postgres/Supabase (app)
                 zod (lib/validation)          │                 └─ memoria (pruebas)
                                               ├─► lib/authz (permisos)
                                               ├─► features/* (reglas puras)
                                               └─► lib/ai (simulación | OpenRouter)
```

- **features/** contiene reglas de dominio puras y probadas (sin E/S): entrevista, diagnóstico, hipótesis, experimentos, briefing, fase y siguiente paso.
- **lib/services/** son los casos de uso. Cada uno resuelve la relación del actor con el proyecto desde los datos (`relationOf`), verifica el permiso con `guard()` y escribe auditoría. Un proyecto ajeno responde `not_found` (no revela su existencia) y deja un evento `access.denied`.
- **app/actions.ts** valida toda entrada con zod, llama al servicio y transforma errores en mensajes seguros; nunca devuelve trazas.
- **lib/runtime.ts** lee la sesión de Supabase Auth y arma las dependencias (`ServiceDeps`: repo de la persona, repo del sistema `sys`, ia, actor, reloj, ids). `homeFor()` decide si la persona va a `/bienvenida`, `/app` o `/app/admin`. Inyectar las dependencias permite probar los servicios sin Next.
- **middleware.ts** refresca la sesión y manda a `/entrar` (o a `/configuracion` si faltan variables) a quien entra a una ruta privada.

## Persistencia

`lib/data/repository.ts` define `Table<T>` (get, list con filtro de igualdad, insert, update con `expectedVersion`) y un `Repository` con una tabla por entidad.

- **Postgres/Supabase** (`supabase-repository.ts`): `createPgRepository(db)` implementa el puerto sobre una interfaz mínima `Db` (select, insert, update por columnas en snake_case). Hay dos drivers: `supabase-db.ts` (supabase-js, en la app) y `tests/pg-db.ts` (pg, en las pruebas, fijando rol y `auth.uid()` por transacción). Un `update` con `expectedVersion` filtra por versión: si no cambia ninguna fila, responde `conflict` o `not_found`. Los errores de Postgres se traducen a los códigos del dominio (`fromPgError`).
- **Repo del sistema**: `ServiceDeps.sys` usa la clave secreta para lo que RLS no permite al cliente (ver [security.md](security.md#dos-clientes-de-supabase) y [ADR 0006](decisions/0006-supabase-auth-and-system-repo.md)).
- **Historial**: lo escribe un trigger; `HistoryTable` completa esa fila (cambio exacto, actor, motivo) en lugar de insertar otra.
- **Memoria** (`memory-repository.ts`): solo para pruebas rápidas; `tests/fixtures/flow-seed.ts` arma un recorrido completo ejecutando los servicios reales.
- Pendiente: subida real de archivos al bucket `evidence` con URL firmada.

## IA

Puerto `AiProvider` (`lib/ai/provider.ts`) con dos implementaciones: `SimulatedProvider` y `OpenRouterProvider`. `getAiProvider()` elige OpenRouter si hay `OPENROUTER_API_KEY`. La salida siempre pasa por `AiTurnSchema` y por `vetProposals` antes de tocar datos. Detalle en [ai-behavior.md](ai-behavior.md).

## Interfaz

- Tailwind v4 con tokens en `app/globals.css` (fondo #0b0b0c, grafito, amarillo #ffd21f, naranja #ff4a1c, cian #3fd8ff) y tipografías Anton / Inter / JetBrains Mono, heredadas del landing original.
- Rutas: `/` landing, `/entrar`, `/auth/callback`, `/bienvenida` (onboarding), `/configuracion`, `/app` (proyectos), `/app/admin`, `/app/p/[id]` con pestañas conversación, diagnóstico, mentoría, validación, tareas e historial.
- Componentes compartidos en `shared/ui/`. Fechas con formato determinista (UTC−6) para evitar errores de hidratación.

## Decisiones

Ver [docs/decisions/](decisions/).
