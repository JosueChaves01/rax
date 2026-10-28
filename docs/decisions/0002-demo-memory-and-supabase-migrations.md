# 0002 · Datos DEMO en memoria y migraciones Supabase listas

Fecha: 2026-10-28 · Estado: aceptada

## Contexto
Se pidió dejar las migraciones listas para conectar a un proyecto Supabase, sin crear el proyecto todavía.

## Decisión
La app corre con un repositorio en memoria sembrado ejecutando los servicios reales (los datos DEMO pasan por las mismas reglas). En paralelo, `supabase/migrations/` define el esquema, RLS y triggers que replican las reglas críticas, con pruebas en `supabase/tests/`.

## Consecuencias
- La demo es navegable sin cuentas externas, y siempre se etiqueta como DEMO.
- Los datos se pierden al reiniciar; no sirve para uso real.
- Hay dos implementaciones de las reglas críticas (servidor y SQL) que deben mantenerse alineadas; las pruebas de ambos lados lo vigilan.
