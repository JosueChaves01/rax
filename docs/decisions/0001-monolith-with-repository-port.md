# 0001 · Monolito Next.js con puerto de repositorio

Fecha: 2026-10-28 · Estado: aceptada

## Contexto
Fase Cero: un equipo pequeño, un solo producto, necesidad de iterar rápido y de probar las reglas sin infraestructura.

## Decisión
Un único proyecto Next.js (App Router). Las reglas viven en `features/` como funciones puras; los casos de uso en `lib/services/` reciben sus dependencias (`ServiceDeps`) y hablan con un puerto `Repository`.

## Consecuencias
- Las pruebas de escenarios corren en milisegundos sin base de datos.
- Cambiar de memoria a Supabase toca un adaptador, no los servicios.
- El puerto es simple (filtro por igualdad); consultas complejas pueden requerir ampliarlo.
