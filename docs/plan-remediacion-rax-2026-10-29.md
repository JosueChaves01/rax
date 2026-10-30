# Plan de remediación de RAX

**Inicio:** 29 de octubre de 2026  
**Base:** auditoría integral `docs/auditoria-integral-2026-10-29.md`; HEAD al iniciar `a29e7ec`.  
**Regla de trabajo:** cambios pequeños, preservar historial/datos y validar cada fase antes de aceptación.

## Prioridad y estado

| Orden | Prioridad | Paquete | Criterio de salida | Estado |
|---|---|---|---|---|
| 1 | P1 privacidad | Revisar RLS efectiva tras todas las migraciones, filtrar notas privadas antes del contexto IA y añadir pruebas SQL/servicio. | Policy final restringe notas privadas; contexto IA las excluye; ejecución RLS de Postgres pendiente. | Filtros y pruebas de servicio listos; migration `20261029000005_rax_membership_role_hardening.sql` limita membresías a perfiles emprendedores; cobertura SQL añadida, falta ejecutar Postgres. |
| 2 | P1 integración | Un agente principal común para todos los chats, con contexto de rol/proyecto/paso, catálogo autorizado de capacidades n8n y propuestas revisables; además, callbacks firmados/persistentes e idempotencia. | El agente puede invocar cada capacidad comprobada o reportarla como no disponible; campos propuestos requieren aprobación; ningún estado “accepted/passed” falso. | Los tres chats comparten hilo privado y acciones; el contrato ya carga contexto de proyecto, `flowId` y esquema de campo. Hay borradores contextuales revisables para diagnóstico, hipótesis, experimentos y tareas. Callback HMAC añadido. RAX-02 sigue apagado y no invoca subflujos; callbacks todavía no persisten propuestas. Migraciones sin ejecutar en PostgreSQL y n8n no operativo. |
| 3 | P1 compilación | Verificar el typecheck sobre el estado actual y resolver cualquier regresión introducida durante la remediación. | `npm run typecheck` sin errores y `npm run build` exitoso. | Typecheck aprobado y lint sin errores (11 advertencias). Un build previo pasó; el intento más reciente se detuvo al crear `.next` con `EPERM`, así que se debe repetir en un entorno con escritura disponible antes de cerrar este punto. |
| 4 | P1 veracidad documental | Dejar de anunciar autoguardado, versiones, generación o revisión cuando no existen. La IA no debe inventar evidencia ni reportar éxito con fallback fijo. | UI identifica claramente borrador local/no guardado; salida externa validada; errores visibles; controles no disponibles no simulan éxito. | Copy y acciones engañosas corregidas o deshabilitadas en chat, aprendizaje, documentos, sesiones, tareas, evaluación y exploración; build local pasa. |
| 5 | P2 métricas | Retirar medidas derivadas sin denominador, escalas artificiales, “satisfacción” estimada desde autonomía y salud de n8n reportada como conectada sin verificación. | Cada KPI tiene definición/fuente y rango; sin datos se muestra “—”; tendencias usan métricas calculadas reales. | Completado en reportes; suite completa pasa. |
| 6 | P1–P2 persistencia funcional | Implementar documentos/versiones, progreso de aprendizaje, chat contextual persistente, notificaciones con estado y decisiones de evaluación editables. | Cambios sobreviven recarga y tienen permisos, historial y estados de error coherentes. | Hilos del agente ya persisten y son privados por usuario/proyecto mediante migración 00006. Documentos/versiones, progreso de aprendizaje, notificaciones y decisiones editables siguen pendientes. |
| 7 | P2–P3 preparación de piloto | Upload firmado/escaneo, compatibilidad explicable, accesibilidad, recuperación de cuenta, consentimiento IA, rate limiting y observabilidad. | Revisión funcional, de privacidad y de operación en staging con datos sintéticos. | Pendiente |
| 8 | Salida | RLS y pruebas DB, contratos n8n, E2E A–E en staging, errores/duplicados, regresión y revisión visual. | Cero P0/P1; recorrido completo documentado; aprobación para aceptación. | Pendiente |

## Corrección de precisión sobre privacidad

La auditoría inicial identificó una política amplia en `20261028000002_rax_security.sql`, pero no ponderó que `20261029000003_rax_sessions_memory.sql` la reemplaza con una policy que limita las notas privadas a su autor. Por tanto, la lectura REST de notas privadas por otro actor **no queda confirmada** cuando se aplican las migraciones en orden. Sigue pendiente comprobar esa policy con la base real; el repositorio en memoria tampoco aplica RLS, y `buildInterviewContext` aceptaba todas las notas recibidas. La fase 1 añade defensa de aplicación y cobertura para ambos casos. No se debe ejecutar el vector con datos reales.

## Requisito actualizado: chats con agente principal

El requisito de producto es que todos los chats se comuniquen con un agente principal común, capaz de consultar contexto autorizado e invocar los flujos especializados para ayudar a llenar/generar campos en cualquier etapa, sección, tarea o paso. El chat general, aprendizaje y conversación de proyecto ya entran por la misma acción y guardan en el hilo privado de la persona para ese proyecto. Se conservan intactos los mensajes de entrevista anteriores. El historial nuevo se carga desde la base por el servicio y RLS. El contrato contextual acepta el flujo y el esquema de un campo; se añadieron asistentes que pueden proponer y aplicar al formulario (sin guardado automático) campos de diagnóstico, hipótesis, experimento y título de tarea. RAX-02 permanece apagado hasta staging y todavía no ejecuta subflujos; la cobertura no incluye aún todos los formularios y campos. La especificación y los límites constan en [main-agent-plan.md](main-agent-plan.md). No declarar el requisito completo todavía.

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

## Avance para preparación de uso real

- `npm test`: 104 pruebas aprobadas; incluye catálogo principal, puertas de staging, firma de callbacks, acciones/hilos persistentes, roles de chat y exclusión de notas privadas.
- `npm run typecheck`: aprobado después del build.
- `npm run lint`: cero errores; 11 advertencias existentes.
- `npm run build`: un build previo generó 22 páginas estáticas; el intento más reciente no pudo crear `.next/server/app/entrar` (`EPERM`). Repetir antes del cierre final.
- El agente y los eventos n8n quedan detrás de `RAX_N8N_MAIN_AGENT_ENABLED` y `RAX_N8N_EVENTS_ENABLED`. Están apagados por defecto y requieren staging verificado. Los callbacks exportados ya firman el cuerpo con HMAC y timestamp, pero no tienen persistencia de resultados en RAX; ahora rechazan propuestas con `501` en lugar de confirmar una persistencia inexistente y exigen que la auditoría se guarde antes de responder.
- Se añadió migración incremental de membresías. No se ejecutó porque `supabase` CLI y `psql` no están instalados; no se modificó ninguna base externa.
- Hilos del agente ya persisten, pero la migración y RLS no se ejecutaron en PostgreSQL. Los chats y formularios de diagnóstico, hipótesis, experimento y título de tarea comparten la acción principal; aprendizaje y documentos aún no persisten su progreso/contenido. RAX-02 no invoca subflujos. No hay staging operativo ni E2E de flujos. RAX no debe declararse listo para uso real todavía.
- La evaluación PREP y la mejora de documentos se deshabilitaron hasta que usen el agente principal con un proyecto y permisos reales; ya no envían IDs de proyecto ficticios a n8n.
