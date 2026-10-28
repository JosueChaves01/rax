# 0006 · Supabase Auth, repositorio del sistema y fin del modo DEMO

Fecha: 2026-10-28 · Estado: aceptada · Reemplaza a [0002](0002-demo-memory-and-supabase-migrations.md)

## Contexto
Ya existe el proyecto Supabase. Se pidió quitar el modo DEMO por completo y agregar un onboarding para cada tipo de persona.

## Decisión
- La app usa Supabase Auth (correo y contraseña con confirmación) y el repositorio Postgres sobre supabase-js. No queda ningún camino con datos DEMO ni acceso por perfil.
- Cada pedido usa **dos** repositorios: el de la persona (clave publishable, RLS) y el del sistema (`sys`, clave secreta) para lo que RLS no deja hacer al cliente: escrituras de la IA, auditoría, detalle del historial y el alta de un proyecto. Los servicios autorizan con `guard()` antes de usar `sys`.
- El historial lo escribe un trigger; el repositorio completa esa fila en vez de duplicarla.
- El onboarding vive en `profiles.onboarding` (jsonb) con `onboarded_at`. Quien quiere mentorear queda `mentor_status = 'pending'` con rol emprendedor hasta que la administración lo aprueba.
- La primera cuenta admin se asigna en SQL.

## Consecuencias
- Las pruebas corren en memoria (rápidas) y contra Postgres con RLS (`test:pg`), con los mismos escenarios.
- La clave secreta es un punto sensible: solo en servidor, nunca en el navegador ni en logs.
- Auth no se pudo probar en vivo desde el entorno de desarrollo; hay que recorrerlo en el proyecto real.
