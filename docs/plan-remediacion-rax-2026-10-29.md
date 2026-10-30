# Plan de remediación de RAX

**Inicio:** 29 de octubre de 2026  
**Base:** auditoría integral `docs/auditoria-integral-2026-10-29.md`; HEAD al iniciar `a29e7ec`.  
**Regla de trabajo:** cambios pequeños, preservar historial/datos y validar cada fase antes de aceptación.

## Prioridad y estado

| Orden | Prioridad | Paquete | Criterio de salida | Estado |
|---|---|---|---|---|
| 1 | P1 privacidad | Revisar RLS efectiva tras todas las migraciones, filtrar notas privadas antes del contexto IA y añadir pruebas SQL/servicio. | Policy final restringe notas privadas; contexto IA las excluye; ejecución RLS de Postgres pendiente. | Código y test de servicio listos; cobertura SQL añadida, falta ejecutar Postgres. |
| 2 | P1 integración | Secreto n8n dedicado y obligatorio, health sin recursión, callback autenticado y persistente o respuesta explícita de no disponible; reprocesamiento real o eliminado como capacidad; RAX-99 debe ejecutar aserciones reales. | Contratos firmados de extremo a extremo, cero secretos de prueba, idempotencia probada y ningún estado “accepted/passed” falso. | Parcial: secreto dedicado, health local y no disponible explícito; firma HMAC del callback y persistencia real siguen pendientes. |
| 3 | P1 compilación | Verificar el typecheck sobre el estado actual y resolver cualquier regresión introducida durante la remediación. | `npm run typecheck` sin errores y `npm run build` exitoso. | Completado: typecheck y build pasan; lint sin errores. |
| 4 | P1 veracidad documental | Dejar de anunciar autoguardado, versiones, generación o revisión cuando no existen. La IA no debe inventar evidencia ni reportar éxito con fallback fijo. | UI identifica claramente borrador local/no guardado; salida externa validada; errores visibles; controles no disponibles no simulan éxito. | Completado en pantallas y acciones modificadas; validar build/integración. |
| 5 | P2 métricas | Retirar medidas derivadas sin denominador, escalas artificiales, “satisfacción” estimada desde autonomía y salud de n8n reportada como conectada sin verificación. | Cada KPI tiene definición/fuente y rango; sin datos se muestra “—”; tendencias usan métricas calculadas reales. | Completado en reportes; suite completa pasa. |
| 6 | P1–P2 persistencia funcional | Implementar documentos/versiones, progreso de aprendizaje, chat contextual persistente, notificaciones con estado y decisiones de evaluación editables. | Cambios sobreviven recarga y tienen permisos, historial y estados de error coherentes. | Pendiente: esta iteración elimina claims engañosos, no añade modelos/migraciones de persistencia. |
| 7 | P2–P3 preparación de piloto | Upload firmado/escaneo, compatibilidad explicable, accesibilidad, recuperación de cuenta, consentimiento IA, rate limiting y observabilidad. | Revisión funcional, de privacidad y de operación en staging con datos sintéticos. | Pendiente |
| 8 | Salida | RLS y pruebas DB, contratos n8n, E2E A–E en staging, errores/duplicados, regresión y revisión visual. | Cero P0/P1; recorrido completo documentado; aprobación para aceptación. | Pendiente |

## Corrección de precisión sobre privacidad

La auditoría inicial identificó una política amplia en `20261028000002_rax_security.sql`, pero no ponderó que `20261029000003_rax_sessions_memory.sql` la reemplaza con una policy que limita las notas privadas a su autor. Por tanto, la lectura REST de notas privadas por otro actor **no queda confirmada** cuando se aplican las migraciones en orden. Sigue pendiente comprobar esa policy con la base real; el repositorio en memoria tampoco aplica RLS, y `buildInterviewContext` aceptaba todas las notas recibidas. La fase 1 añade defensa de aplicación y cobertura para ambos casos. No se debe ejecutar el vector con datos reales.

## Dependencias

- El paquete n8n necesita la misma clave dedicada configurada en ambos servicios y una instancia de staging para activar y verificar flujos. Ningún valor secreto se guardará en código ni en el informe.
- El paquete de persistencia documental requiere decisión de modelo/versionado y migración; hasta entonces se eliminarán claims de guardado/publicación y fallbacks que fabriquen contenido.
- E2E remoto solo se hará con cuentas y proyectos sintéticos en staging, luego de cerrar privacidad y autenticación de callbacks.

## Verificaciones locales de inicio

- `npm test`: 81 pruebas aprobadas en el estado inicial.
- `npm run typecheck`: la auditoría reportó errores en snapshot previo; el HEAD actual incluye cambios posteriores y debe verificarse nuevamente al integrar los paquetes.
- `npm run lint`: 0 errores y 14 advertencias en el snapshot inicial.
- No se ejecutaron migraciones contra Supabase remoto ni llamadas a OpenRouter/n8n.

## Verificación de esta iteración

- `npm test`: 86 pruebas aprobadas.
- `npm run typecheck`: aprobado después de corregir una prop JSX duplicada.
- `npm run lint`: aprobado sin errores; permanecen advertencias existentes sin relación directa con estas correcciones.
- `npm run build`: aprobado; Next.js compiló y generó las 22 páginas estáticas.
- No se ejecutaron RLS contra Postgres ni llamadas a servicios externos.
