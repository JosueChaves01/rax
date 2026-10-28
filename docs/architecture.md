# Arquitectura

## Visión general

Monolito Next.js 15 (App Router) en TypeScript estricto. Sin servicios externos obligatorios.

```
navegador ──► Server Components (lectura) ──► lib/services ──► Repository (puerto)
          └─► Server Actions (app/actions.ts)  │                 ├─ memoria (hoy)
                 zod (lib/validation)          │                 └─ Supabase (pendiente)
                                               ├─► lib/authz (permisos)
                                               ├─► features/* (reglas puras)
                                               └─► lib/ai (simulación | OpenRouter)
```

- **features/** contiene reglas de dominio puras y probadas (sin E/S): entrevista, diagnóstico, hipótesis, experimentos, briefing, fase y siguiente paso.
- **lib/services/** son los casos de uso. Cada uno resuelve la relación del actor con el proyecto desde los datos (`relationOf`), verifica el permiso con `guard()` y escribe auditoría. Un proyecto ajeno responde `not_found` (no revela su existencia) y deja un evento `access.denied`.
- **app/actions.ts** valida toda entrada con zod, llama al servicio y transforma errores en mensajes seguros; nunca devuelve trazas.
- **lib/runtime.ts** arma las dependencias (`ServiceDeps`: repo, ia, actor, reloj, ids). Inyectarlas permite probar los servicios sin Next.

## Persistencia

`lib/data/repository.ts` define `Table<T>` (get, list con filtro de igualdad, insert, update con `expectedVersion`) y un `Repository` con una tabla por entidad.

- **Hoy**: `memory-repository.ts`, en memoria del proceso, sembrado con datos DEMO (`demo-seed.ts`) ejecutando los servicios reales. Se reinicia con el servidor; en serverless, cada instancia tiene su propia copia.
- **Supabase**: `supabase/migrations/` está listo y probado (ver [testing.md](testing.md)). Falta (PLANNED):
  1. Adaptador `createSupabaseRepository()` que implemente `Repository` con `@supabase/ssr`, mapeando camelCase ↔ snake_case. Los ids pasan de texto (`p_1`) a uuid.
  2. Autenticación real con Supabase Auth reemplazando la cookie `rax_demo_user`; `getActor` leería `auth.getUser()`.
  3. Escrituras de la IA con el cliente `service_role` (sin `auth.uid()`), que los triggers distinguen para impedir que pise contenido humano.
  4. `history` e `audit_events` hoy se escriben desde los servicios; en Supabase el historial lo escribe un trigger, por lo que el adaptador debe omitir esa inserción.
  5. Subida real de archivos al bucket `evidence` con URL firmada.

## IA

Puerto `AiProvider` (`lib/ai/provider.ts`) con dos implementaciones: `SimulatedProvider` y `OpenRouterProvider`. `getAiProvider()` elige OpenRouter si hay `OPENROUTER_API_KEY`. La salida siempre pasa por `AiTurnSchema` y por `vetProposals` antes de tocar datos. Detalle en [ai-behavior.md](ai-behavior.md).

## Interfaz

- Tailwind v4 con tokens en `app/globals.css` (fondo #0b0b0c, grafito, amarillo #ffd21f, naranja #ff4a1c, cian #3fd8ff) y tipografías Anton / Inter / JetBrains Mono, heredadas del landing original.
- Rutas: `/` landing, `/entrar`, `/app` (proyectos), `/app/admin`, `/app/p/[id]` con pestañas conversación, diagnóstico, mentoría, validación, tareas e historial.
- Componentes compartidos en `shared/ui/`. Fechas con formato determinista (UTC−6) para evitar errores de hidratación.

## Decisiones

Ver [docs/decisions/](decisions/).
