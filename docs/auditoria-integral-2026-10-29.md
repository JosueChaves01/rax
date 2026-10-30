# Auditoría integral de RAX

**Fecha:** 29 de octubre de 2026  
**Alcance:** inspección estática de código, migraciones, flujos n8n, documentación y pruebas existentes; ejecución local de pruebas automatizadas, TypeScript y lint.  
**Modo:** solo lectura sobre el código. No se implementaron correcciones.  
**Recomendación:** **Requiere correcciones antes de las pruebas de aceptación.**

## 1. Resumen ejecutivo

RAX tiene una base de producto sustancial para el ciclo central: autenticación Supabase, proyectos, entrevista y diagnóstico versionado, reglas de acceso en servicios y RLS, relaciones y acuerdos, objetivos, sesiones, hipótesis, experimentos, tareas, evidencias como metadatos, intervenciones de mentor y evaluaciones. La lógica central tiene pruebas automatizadas que pasan.

No se puede declarar listo para aceptación ni producción. Hay un defecto **P0** de privacidad: la política RLS de `session_notes` deja leer las notas privadas a cualquier miembro del proyecto. Además, el servicio de conversación consulta esas filas y las agrega al contexto enviado al proveedor de IA. El filtro que oculta notas en una vista de servidor no protege el acceso directo a Supabase ni esa ruta de IA. El commit vigente (`7cdc97a`, “Replace dashboard mocks with live data”) también deja fallar el typecheck en tres rutas de pantalla.

Las otras brechas mayores son: los 19 JSON de n8n están inactivos; su enrutador de eventos no invoca sub-workflows; el callback solo registra metadatos y descarta el contenido de las propuestas; el flujo de reprocesamiento no vuelve a ejecutar nada; y RAX-99 fabrica resultados «passed» sin correr casos. La clave compartida local tampoco está configurada con el mismo valor esperado por n8n; los workflows incluyen un secreto de prueba conocido como fallback. El chat global, aprendizaje, documentos y varias métricas contienen datos o resultados fijos que la interfaz presenta como reales.

### Veredicto por alcance

- **Flujos core de mentoría:** implementados parcialmente y con lógica demostrada por pruebas en memoria; falta recorrido E2E completo sobre Supabase real y UI actual.
- **Aislamiento/privacidad:** **FAIL crítico** en notas privadas, pese a controles positivos en otras entidades y pruebas de aislamiento del proyecto.
- **IA propia de la app:** existe proveedor simulado etiquetado y proveedor OpenRouter con esquema/validaciones; no se probó contra OpenRouter real.
- **n8n:** archivos y contratos existen, pero no constituyen una integración operativa comprobada.
- **UI/UX:** varias pantallas son presentaciones o prototipos con estado local, datos fijos, botones sin efecto persistente o mensajes de éxito sin operación respaldada.
- **Entorno conectado:** `.env.local` contiene variables de Supabase, OpenRouter y URL n8n, pero sus valores no se divulgaron. No se hizo una operación en vivo contra cuentas, base o proveedor. La conexión remota queda **NOT VERIFIABLE**.

## 2. Inventario real

### Arquitectura

- **Framework/lenguaje:** Next.js 15 App Router, React 19, TypeScript estricto, Tailwind 4, Zod 4; dependencias en `package.json`.
- **Estructura:** `app/` rutas y Server Actions; `features/` reglas; `lib/services/` casos de uso; `lib/data/` repositorio de memoria y adaptador Supabase/Postgres; `lib/ai/` proveedor, contexto, prompts, schemas y aplicación de propuestas; `shared/ui/`; migraciones y pruebas SQL en `supabase/`; JSON de workflows en `workflows/n8n/`.
- **Mapa de arquitectura observado:** navegador → Server Components/Actions → validación Zod → servicios y autorización (`lib/authz.ts`, `lib/services/base.ts`) → repositorio → Supabase; tareas de IA de los servicios → proveedor local simulado/OpenRouter. Hay despacho opcional de eventos a n8n en algunos servicios; no hay una cola duradera identificada.
- **Identidad/roles:** Supabase Auth; `entrepreneur`, `mentor`, `admin`; onboarding y aprobación administrativa. Middleware refresca cookies y protege rutas privadas; los permisos de negocio están en servicios y RLS.
- **Modelos:** `types/domain.ts`; las migraciones crean perfiles, proyectos, miembros, asignaciones, conversaciones/mensajes, diagnóstico e historial, comentarios, sesiones/notas, hipótesis, experimentos/resultados, evidencias, tareas, auditoría; migraciones posteriores agregan relaciones, acuerdos, objetivos, hoja de ruta, evaluaciones e intervenciones. No se encontró modelo de documentos de expediente con versiones, asignaciones de aprendizaje ni entrega de notificaciones.
- **Rutas públicas/de cuenta:** `/`, `/entrar`, `/auth/callback`, `/bienvenida`, `/configuracion`.
- **Rutas de aplicación:** `/app`, `/app/admin`, `/app/mentor`, `/app/mentor/recursos`, `/app/p/[id]` con `/conversacion`, `/diagnostico`, `/orientar`, `/acuerdos`, `/validacion`, `/tareas`, `/mentoria`, `/decidir`, `/evaluacion`, `/historial`; además `/app/aprendizaje`, `/calendario`, `/chat`, `/documentos`, `/documentos/[id]`, `/evaluacion`, `/exploracion`, `/relaciones`, `/reportes`, `/sesiones`, `/sugerencias`, `/tareas`.
- **Endpoints:** `/api/n8n/health`, `/api/n8n/callback`; OAuth en `/auth/callback`; operaciones de la app mayormente son Server Actions en `app/actions.ts`.
- **Integraciones declaradas:** Supabase Auth/DB/Storage, OpenRouter y n8n. El almacenamiento configura bucket privado `evidence`; no se localizó carga de archivos real desde la UI, solo registro de evidencia/metadatos. Sin RAG/embeddings; el contexto es una selección determinista acotada.
- **Observabilidad:** eventos de auditoría para acciones de dominio; health check y reports. No se verificó telemetría real de ejecuciones n8n, tasas/costos de modelos ni alertas operativas.

### Pantallas y pruebas

Las rutas listadas arriba existen en `app/app/`. Las pantallas compartidas importantes están en `shared/ui/` (dashboard, mentor, documentos, sesiones, tareas, informes, sugerencias y operaciones administrativas). La existencia de una pantalla no equivale a persistencia.

Pruebas disponibles: Vitest en memoria para reglas, onboarding, ciclo de vida, mentoría, hipótesis, portafolio y workflows; tests SQL de migraciones/RLS contra stubs locales; adaptador PostgreSQL opcional (`test:pg`). Las pruebas n8n validan presencia/forma de JSON y contratos/HMAC, no importación ni ejecución en n8n.

## 3. Matriz de trazabilidad

Estados: **PASS** comprobado suficientemente; **PARTIAL** funcionalidad real incompleta; **FAIL** condición necesaria ausente o defectuosa; **NOT VERIFIABLE** requiere servicio/configuración/entorno no comprobado. P0–P3 según el prompt.

| ID | Requisito / evidencia de UI | Backend / datos | Workflow n8n/IA | Estado | Prioridad |
|---|---|---|---|---|---|
| A | Inicio/cierre y navegación: `/entrar`, `/app`, middleware y acciones; no recuperación de contraseña. | Supabase Auth, server actions, `homeFor()`, guards; solo middleware limita rutas de presentación. | N/A | PARTIAL | P2 |
| A2 | Roles, rutas protegidas, carga/error/denegado y móvil existen parcialmente; sin walkthrough actual ni QA visual/responsivo en este entorno. | `authz.ts`, RLS y estados de acciones; Auth real sin verificación en vivo. | N/A | NOT VERIFIABLE | P2 |
| B | `/app/mentor`, bandeja, cartera, recursos y sesiones. Sugerencias de bloqueos son derivadas; próximas sesiones y alertas no forman un sistema completo. | `portfolio.ts`, `mentoring.ts`, `resources.ts`; notas privadas filtradas en workspace, pero RLS defectuosa (H-01). | La preparación real usa proveedor IA de la app; n8n opcional no comprobado. | PARTIAL | P1 |
| C | Dashboards de emprendedor y mentor derivan datos de proyectos, tareas y cartera; presentan estados vacíos si no hay actividad. | Proyectos, objetivos, tareas, actividad y métricas de cartera reales. | N/A | PARTIAL | P2 |
| D | `/app/exploracion` ahora comienza en paso 1 sin score fijo; no calcula ni justifica matching mentor-emprendedor ni muestra resultado/error de la aceptación. | Entidades y servicios de relación/compatibilidad existen y tienen tests; la pantalla no muestra recomendación explicable. | No hay matching n8n operativo. | PARTIAL | P1 |
| E | Diagnóstico, corrección, estado de revisión, evidencia citada e historial. | Reglas, control de versión, triggers de historial y RLS; escenarios A–D/H. | IA de app filtra propuestas antes de persistir; OpenRouter real sin comprobar. | PASS* | P1 |
| F | Acuerdos/objetivos versionados y aprobaciones mutuas visibles en `/acuerdos`. | `mentorship-relation.ts`, migraciones, controles de transición y tests. | n8n de objetivos no conectado al enrutador. | PASS* | P2 |
| G | Tareas/hitos, fechas, estados, bloqueos y reprogramaciones parciales. No hay modelo claro de dependencias entre tareas ni auditoría completa de toda reprogramación. | `roadmap.ts`, tareas/milestones/evidencias y RLS. | Propuestas n8n no llegan a la app. | PARTIAL | P2 |
| H | Sesiones, agenda, notas, briefings, síntesis y decisiones en workspace. | `mentoring.ts`, permisos por mentor asignado; nota privada con exposición en RLS y contexto IA (H-01). | Se despachan algunos eventos, pero workflows inactivos. | PARTIAL | P0 |
| I | `/app/p/[id]/conversacion` usa el flujo persistente; `/app/chat` es otra pantalla genérica con historial solo React, proyecto global y saludo «RAX-02 activo» falso. | `conversation.ts` guarda mensajes y propuestas en DB; AI context acotado salvo filtrado de notas privadas ausente. | La acción de chat llama n8n global; fallback es texto fijo y devuelve proveedor `openrouter`. | PARTIAL | P1 |
| J | `/aprendizaje` ahora inicia sin respuesta/puntaje prefijados y evalúa una práctica PREP; aún ofrece un solo ejercicio y estados/pestañas/progreso solo en React. No existe ciclo persistente de Minto/PREP/STAR/MECE asignado por mentor. | `evaluateExerciseAction`; no entidad de entrega/progreso del aprendizaje. | Acción invoca IA local, no un workflow n8n/RAX-99 como su encabezado sugiere. | PARTIAL | P1 |
| K | Hipótesis, criterios ex ante, experimentos, resultados y evidencia textual se implementan en `/validacion`. | Reglas dominio, auditoría, locks de criterios, RLS y tests. Evidencia de archivo: falta carga real. | Sugerencias de IA locales; RAX-12/13 inactivos. | PARTIAL | P2 |
| L | Tareas vencidas/bloqueadas existen; recordatorio es una vista/evento derivado. Sin notificación de entrega/reintentos/deduplicación demostrada. | Estados y tareas persisten. | RAX-10 inactivo. | PARTIAL | P2 |
| M | `/app/evaluacion` carga conteos reales, pero persiste `goalEvaluations: []`, autonomía/feedback/foco fijos; sin relación muestra éxito local sin guardar. Evaluación de workspace tiene modelo persistente. | `evaluation.ts`, tabla e historial; tests H1–H2. UI no captura valoración completa de metas ni línea base vs resultado. | RAX-14 inactivo. | PARTIAL | P2 |
| N | `/reportes` y pestaña operaciones enseñan métricas. Incluyen defaults inventados y series sintéticas; cambios porcentuales/satisfacción no provienen de mediciones. | Algunas cuentas cuentan datos reales; total de auditorías no es tasa de adopción ni ejecución; cobertura temporal inconsistente. | RAX-15 no persistente/inactivo. | FAIL | P2 |
| O | Drawer de notificaciones muestra una lista construida en el layout; no se encontraron preferencias, estados de entrega ni deduplicación persistente. | Datos locales derivados, sin entidad/servicio de notificaciones. | RAX-10 solo borradores en su descripción; está inactivo. | FAIL | P2 |
| P | `/documentos` lista recursos y `/documentos/[id]` muestra editor visual. La edición no se guarda; “IA” ignora respuesta y pone contenido fijo; versionado, revisión, publicación y exportación reales ausentes. | Los recursos son persistentes; no hay documento/versiones de expediente ni exportador PDF/DOCX. | `improveDocumentWithAIAction` no equivale a generación documental contextual/versionada. | FAIL | P1 |
| Q | `/admin` resuelve revisión/asignación; subpanel operaciones muestra estimaciones desde auditoría y health check, no historial real de n8n. | `admin.ts`, guardas/RLS para asignaciones; métricas actuales en página modificada. | RAX-15 y API n8n incompletos; sólo metadata operativa. | PARTIAL | P1 |
| IA | Diagnóstico/hipótesis/experimentos/briefing/evaluación con schemas Zod, contexto y propuesta humana; las ediciones finales no se automatizan. | `AiProvider`, `vetProposals`, auditoría; simulación local y OpenRouter. | Integración n8n paralela, no operativa. | PARTIAL | P1 |
| SEG-01 | Aislamiento de proyectos y roles. Tests de escenarios F y policies comprueban casos de miembros y mentor no asignado. | `guard()` y RLS aportan defensa por capas; falta el caso privado. | La identidad en workflows es declarada en body; no hay consulta/validación propia de n8n. | PARTIAL | P0 |
| SEG-02 | Nota privada marcada en sesión. | `notes_select` solo exige `can_read_project`, sin condición `is_private`; `conversation.ts` carga notas y `buildInterviewContext` serializa todas. Exposición confirmada por inspección, no se hizo petición a datos reales. | Riesgo adicional de envío a proveedor IA. | FAIL | P0 |
| E2E | Pruebas representativas A–H en memoria y parte SQL. No hay automatización E2E de navegador en CI ni ejecución integral con servicios reales. | `npm test` pasa; DB real no conectada/verificada. | Workflows no se ejecutaron. | NOT VERIFIABLE | P1 |

`PASS*` significa que la lógica/modelo de dominio tiene implementación y tests automáticos, no que se haya comprobado UI E2E o despliegue productivo.

### Workflows RAX

Hay 19 archivos nombrados como catálogo, con nodos y conexiones JSON; todos declaran `active: false`. RAX-03 a RAX-14 y RAX-15/90 usan triggers internos o de error, pero no se encontró enrutamiento conectado desde RAX-01 hacia ellos ni un entorno n8n activo. Aun cuando un flujo individual tenga nodos HTTP/OpenRouter, su operación, credenciales, persistencia, reintentos e idempotencia no están acreditados.

| ID | Hallazgo estático | Estado |
|---|---|---|
| RAX-00 | Existe health workflow; llama `/api/n8n/health`, que vuelve a invocar `/webhook/rax-health` (`checkN8nHealthLive`): ciclo recursivo al activarlo. Hace ping OpenRouter. | FAIL |
| RAX-01 | HMAC/ventana anti-replay y comprobación mínima; el Switch no conecta sus salidas a sub-workflows. No valida contrato Zod completo ni deduplica `eventId`. | FAIL |
| RAX-02 | Webhook/OpenRouter/schema de salida; llamado por la pantalla global, no por entrevista contextual del proyecto. Fallback de secreto conocido. | PARTIAL |
| RAX-03 | JSON con trigger de ejecución y petición HTTP; inactive y no invocado desde RAX-01; persistencia no comprobada. | PARTIAL |
| RAX-04 | Igual: definición de extracción diagnóstico, sin ejecución/conexión/persistencia operativa verificable. | PARTIAL |
| RAX-05 | Igual: preparación de sesión existe también en servicios IA internos; flujo n8n no conectado. | PARTIAL |
| RAX-06 | Igual: síntesis estructurada propuesta, no se comprobó conexión ni aprobación/persistencia en app. | PARTIAL |
| RAX-07 | Igual: propuestas de objetivos; no demuestra sincronización con acuerdo de dominio. | PARTIAL |
| RAX-08 | Igual: propuestas de tareas; sin idempotencia demostrada. | PARTIAL |
| RAX-09 | Igual: intervención; no se comprobó persistencia a bandeja ni reglas de deduplicación. | PARTIAL |
| RAX-10 | Tiene Schedule Trigger en JSON; inactive, por tanto no hay recordatorios programados verificados. | FAIL |
| RAX-11 | Definición de recomendaciones; catálogo persistente/recomendación también es local a servicios. Sin conexión desde ingreso. | PARTIAL |
| RAX-12 | Diseño de experimentos definido; no conectado ni ejecución operativa probada. | PARTIAL |
| RAX-13 | Análisis de evidencia definido; no comprobado contra criterios/persistencia/decisión humana. | PARTIAL |
| RAX-14 | Evaluación definida; dominio de ciclo existe localmente, workflow no operativo. | PARTIAL |
| RAX-15 | Extrae métrica de input y llama callback, pero callback no persiste métricas; no hay fuente observable de ejecuciones. | FAIL |
| RAX-90 | Error Trigger y envío de callback; no se comprobó que esté asociado a los workflows o que callback persista error detallado. | PARTIAL |
| RAX-91 | Valida actor declarado `admin/system` y devuelve 202, pero no tiene nodo que invoque el workflow original; además el actor no se valida contra identidad Supabase. | FAIL |
| RAX-99 | El código mapea 12 expectativas a `status: 'passed'` sin ejecutar aserciones ni invocar modelos; no es una suite de pruebas. | FAIL |

## 4. Defectos, riesgos y elementos pendientes

### Defectos comprobados

| ID | Hallazgo, evidencia y reproducción | Impacto / prioridad | Remediación propuesta y aceptación |
|---|---|---|---|
| H-01 | `supabase/migrations/20261028000002_rax_security.sql:297` permite seleccionar notas con `public.can_read_project(project_id)` sin filtrar `is_private`. `lib/services/conversation.ts:45` lee todas las `sessionNotes` del proyecto; `lib/ai/context.ts:56` coloca el contenido en `mentorNotes`. El filtro de presentación está en `lib/services/projects.ts:183`, posterior a la consulta, y no cubre REST. Reproducción propuesta en entorno de prueba: emprendedor dueño consulta `session_notes` de su proyecto con `is_private=true`; luego envía un mensaje y examina el contexto capturado por proveedor stub. | **P0** exposición de notas privadas y datos al modelo externo. | Corregir política RLS y reducir contexto para emprendedor en servidor. Prueba de aceptación: consulta directa como dueño/colaborador devuelve cero notas privadas; mentor asignado conserva acceso; provider mock confirma que ninguna nota privada se envía al chat de emprendedor. Añadir tests SQL y de servicio. |
| H-02 | `workflows/n8n/RAX-01-event-ingress.json` usa `RAX_N8N_SHARED_SECRET || 'test-shared-secret-rax-n8n'`; RAX-02 y RAX-91 usan el mismo fallback. La función RAX firma con `RAX_N8N_SHARED_SECRET || SUPABASE_SECRET_KEY` en `lib/n8n/security.ts`. En el `.env.local` inspeccionado hay secreto Supabase y URL n8n pero no `RAX_N8N_SHARED_SECRET`; no se muestran valores. Por ello no hay un valor coincidente demostrado. Si se importan/activan sin configurar, el fallback conocido acepta firmas creadas por terceros y las firmas de RAX usan otra clave. | **P1** bloqueo de integración y autenticación débil si se activan tal cual. | Exigir secreto aleatorio dedicado en ambos lados, fallar cerrado si falta, eliminar fallback de prueba de workflows importables. Pruebas de firma cruzada y rechazo si falta configuración. |
| H-03 | RAX-01 conecta `Respond 202 Accepted` al Switch, pero las salidas de `Route by EventType` no conectan ningún sub-workflow. Callback `/api/n8n/callback` (`route.ts:50-88`) fuerza `needsHumanApproval` y registra solo auditoría/count; no guarda propuestas ni notifica a la app. | **P1** eventos aceptados se pierden y resultados IA no llegan/persisten. | Añadir dispatch durable y manejo idempotente; persistir resultados/propuestas en estado pendiente y exponerlos en UI. Aceptación: un evento de prueba recorre workflow, genera callback, persiste propuesta pendiente una sola vez y aparece al usuario autorizado. |
| H-04 | En `app/api/n8n/health/route.ts:7` health invoca `checkN8nHealthLive`; `RAX-00` hace ping a esa misma ruta. Al habilitar health se forma recursión hasta timeout. | **P1** monitorización falsa/inestable y uso de solicitudes anidadas. | Hacer health de RAX sin consultar el webhook de n8n que lo originó; probar cada componente en dirección única. |
| H-05 | `RAX-91` termina en respuesta 202 y no ejecuta `targetWorkflow` ni re-emite `event`; `actor.role` se toma de body firmado, no se comprueba con una fuente de identidad de usuarios. | **P1** no reprocesa; control de autorización de servicio depende de secreto compartido. | Resolver ejecución original desde registro confiable, revalidar permisos y aplicar clave idempotente. Aceptación: no-admin rechazado, reintento autorizado ejecuta exactamente una vez y queda vinculado a original. |
| H-06 | `RAX-99` devuelve las doce pruebas como aprobadas por construcción (`results = testCases.map(... status: 'passed')`). No prueba integración, privacidad, errores ni datos duplicados. | **P1** falsa señal de aceptación y cobertura. | Reemplazar con pruebas reales que hagan aserciones y fallen ante una regresión; estados no ejecutados no pueden figurar como pass. |
| H-07 | En `shared/ui/document-editor-view.tsx` modificado localmente, las secciones ahora empiezan vacías y aplica `res.reply`, corrigiendo el contenido fijo inicial. Aún dice “Guardado automáticamente” y v1.0 sin escritura/versión; Historial/Comentarios, guardar, descartar y solicitud de revisión siguen sin flujo persistente. | **P1** riesgo de pérdida de trabajo y ningún ciclo documental completo. | Modelar documento/versiones y permisos; persistir antes de indicar guardado/revisión; aceptación tras reload, versionado, aprobación, compartición/exportación. |
| H-08 | `app/app/chat/page.tsx` presenta chat conectado/activo, pero `sendN8nChatAction` usa `projectId: 'global'`, contexto fijo vacío y estado de React; fallback devuelve texto prefabricado con provider `openrouter`. No hay historial persistido ni errores de proveedor propagados de forma fiel. | **P1** interfaz comunica contexto e integración inexistentes. | Enlazar a proyecto/contexto autorizado y persistir conversación; distinguir simulación/fallback e integración activa. Test de historial tras recarga y datos autorizados. |
| H-09 | `app/app/aprendizaje/page.tsx` ya no precarga respuesta/puntaje/75%, pero sigue con una práctica PREP y estados/pestañas/progreso solo en React. No hay asignación ni entrega persistida; encabezado conserva afirmación de evaluación vía n8n. | **P1** no se puede demostrar aprendizaje aplicado ni progreso; proveedor anunciado no corresponde a la acción. | Implementar biblioteca/asignaciones persistidas para los cuatro métodos y vincular evaluación humana/IA a objetivos. |
| H-10 | El working copy cambia defaults vacíos de reportes a 0/— y quita cambios fijos, pero adopción sigue siendo proporción de auditorías, satisfacción usa rating de autonomía con fallback 4 y gráficos multiplican conteos por 20/25: no son series de progreso medidas. En admin operaciones, ejecuciones = auditorías, éxito = acciones sin `denied` y costo = `$0.00`. | **P2** decisiones de gestión basadas en métricas mal definidas/estimadas presentadas como medidas. | Mantener estados “sin dato”; definir denominadores/escalas reales; separar autonomía de satisfacción y auditorías de ejecuciones n8n. |
| H-11 | `app/app/exploracion/page.tsx` elimina el score fijo 94 y comienza en paso 1, pero aún no muestra cálculo o justificación de compatibilidad; el handler marca aceptación local antes de comprobar la respuesta de `completeExplorationAction` y no representa errores. | **P2** recomendación y consentimiento de relación no demostrados. | Mostrar solo candidatos reales, criterios y justificación; derivar estado de relación persistida y feedback del servidor. |
| H-14 | `shared/ui/evaluation-view.tsx` recibe conteos reales, pero al guardar envía lista de evaluaciones vacía, autonomía 4, feedback/foco prefijados; sin IDs de proyecto/relación retorna éxito local. | **P2** evaluación final no refleja un juicio capturado y puede afirmar guardado falso. | Capturar resultados por objetivo, autonomía y observaciones; impedir éxito sin persistencia; cargar historial y probar renovación/cierre. |
| H-15 | Typecheck en HEAD `7cdc97a` falla en `app/app/page.tsx:42` (`formatDate`), `app/app/relaciones/page.tsx:45-46` (usa estado `active` y `cycleNumber` no presentes en el tipo de relación) y `app/app/reportes/page.tsx:91` (reduce evaluaciones como número a string). Reproducido con `npm run typecheck`. | **P1** impide declarar build/type safety y probablemente bloquea el build de producción; el build no se ejecutó. | Corregir imports/campos y reducir sobre una métrica numérica definida; aceptación: typecheck y build limpios, además de pruebas de regresión. |
| H-12 | `EvidenceForm` admite archivo, pero docs/product-context y README reconocen archivos solo como metadatos; en UI no se verificó carga real a Storage ni URL firmada. | **P2** evidencia documental no disponible al flujo. | Implementar subida/descarga firmada, límites y escaneo; aceptación de permisos por dueño/mentor y bloqueo de tercero. |
| H-13 | La migración crea tabla de notas pero el test SQL RLS no crea/cubre nota privada; tests del escenario F verifican proyecto ajeno, no el campo `is_private`. La prueba automatizada actual deja pasar H-01. | **P0** regresión de privacidad sin alarma. | Agregar prueba de fila privada como parte obligatoria de `test:db` y `test:pg`. |

### Recomendaciones y elementos no verificables

- **NOT VERIFIABLE:** Auth real, confirmación de correo, roles del proyecto conectado, publicación real de migraciones, proveedores OpenRouter/n8n y costo/latencia; requieren comprobación en staging con cuentas de prueba.
- **NOT VERIFIABLE:** aislamiento por manipulación de IDs contra el Supabase remoto. El código y los tests locales cubren parte de los controles, pero no se enviaron solicitudes a datos reales.
- **NOT VERIFIABLE:** accesibilidad, lector de pantalla, breakpoints actuales, rendimiento, errores de consola y flujos de navegador autenticados. Las capturas en README son anteriores a Supabase.
- **Recomendación:** alinear `docs/progress.md`, `docs/testing.md`, `docs/product-context.md` y catálogo n8n: el progreso declara integración IMPLEMENTED, mientras decisiones/contexto aún excluyen n8n; docs/testing reporta 40 pruebas, hoy corren 81. Un catálogo y docs de estado contradictorios son riesgo de operación.
- **Recomendación:** permisos/privacidad para `mentor_interventions`, recursos privados, exportaciones, consentimiento explícito para OpenRouter, limitación de solicitudes, SMTP y recuperación de contraseña antes de piloto con datos reales.

## 5. Resultados de pruebas

| Prueba | Estado | Entorno/pasos | Observado / evidencia |
|---|---|---|---|
| Suite existente `npm test` | Ejecutada: PASS | Vitest local, repositorio principalmente en memoria; `tests/n8n` estructural/contratos. | 15 archivos, 81 pruebas, todas pasan. Incluye escenarios A–H. Los logs de 429 y salida JSON inválida son casos simulados de OpenRouter. |
| TypeScript `npm run typecheck` | Ejecutada: FAIL | Compilación local sobre el working tree observado tras HEAD `7cdc97a`. | 5 errores TypeScript en tres rutas: `app/app/page.tsx:42` `formatDate` sin importar; `app/app/relaciones/page.tsx:45-46` estados/campo incompatibles con `MentorshipRelation`; `app/app/reportes/page.tsx:91` reducción suma un tipo `CycleEvaluation` en vez de número. |
| Lint `npm run lint` | Ejecutada: PASS con advertencias | ESLint local sobre el working tree observado. | 0 errores, 14 warnings de imports/variables sin uso en actions, sesiones y tests. |
| RLS/migraciones `test:db`, `test:pg` | Propuesta/no ejecutada | No se ejecutaron porque dependen de Postgres/credenciales de prueba; no se verificó Supabase real. | Test SQL existe contra stubs; docs describe test PostgreSQL aparte. Añadir caso de nota privada (H-13). |
| A. Ciclo integral de mentoría | Propuesta/no ejecutada E2E | Puede probarse con cuenta de staging y datos sintéticos. | Unidades/servicios prueban partes; continuidad de UI → DB real → n8n → proveedor no comprobada. |
| B. Aprendizaje PREP/Minto/STAR/MECE | Propuesta/no ejecutada | Ejecución aislada posible con fixture; asignación real no existe en datos. | Estado/progreso inicial fijo y sin persistencia. |
| C. Generación documental | Propuesta/no ejecutada | Requiere fixture y persistencia de versiones. | Editor no guarda, no exporta y no implementa aprobación/compartición. |
| D. Fallo/recuperación IA y duplicados | Parcialmente cubierto solo en unit tests; E2E propuesta | Tests usan fetch simulado, no proveedor. | No se pudo verificar callback ni retry idempotente en n8n; RAX-91 no reejecuta. |
| E. Aislamiento y privacidad | FAIL por revisión estática; ataque no enviado a datos | Evidencia H-01; prueba directa sugerida en DB efímera. | Política SQL da SELECT de notas privadas a `can_read_project`; contexto de IA incluye notas. No acceder a datos reales. |
| UI desktop/tablet/móvil y rutas privadas | NOT VERIFIABLE | No se hizo recorrido autenticado de navegador. | No afirmar que el recorrido manual reportado en docs corresponde al árbol actual. |
| Workflows n8n | No ejecutados | JSON local; `active=false` en los 19; sin instancia/importación comprobada. | Tests solo confirman estructura básica, HMAC y esquemas. |

## 6. Plan de remediación ordenado

1. **P0 – Cerrar exposición de notas privadas:** condicionar lectura en RLS por dueño/colaborador/mentor y `is_private`; filtrar en servidor antes de usar contexto IA; añadir tests REST/RLS/servicio para dueño, colaborador, mentor asignado y no asignado.
2. **P1 – Restablecer typecheck/build:** resolver errores en `app/app/page.tsx`, `relaciones/page.tsx` y `reportes/page.tsx` reportados por HEAD `7cdc97a`; repetir typecheck y build.
3. **P1 – Hacer confiable la integración n8n o deshabilitar afirmaciones de UI:** eliminar secretos fallback; configurar clave dedicada; conectar RAX-01 a workflows, asegurar persistencia de callback y reprocesamiento; arreglar health sin recursión; convertir RAX-99 en pruebas auténticas. Depende de acordar contrato y credenciales de staging.
4. **P1 – Honestidad de UI y persistencia:** completar documento versionado, aprendizaje aplicado y chat contextual/persistente; hasta entonces ocultar o rotular estados/datos de demostración, sin anunciar “activo”, “guardado” o “notificación enviada”.
5. **P2 – Corregir métricas y alertas:** retirar constantes, definir fuentes y denominadores; separar auditorías, ejecuciones de workflow y métricas estimadas; implementar notificaciones persistentes y deduplicación si están dentro del alcance.
6. **P2 – Cerrar brechas de producto:** compatibilidad explicable, dependencias de tareas, upload firmado de archivos, recuperación de cuenta, consentimiento IA, rate limit y accesibilidad.
7. **Pruebas de salida por fase:** tests de unidad existentes + RLS local + Postgres con RLS + contratos de workflows + E2E navegador con cuentas ficticias en staging + regresión de duplicados/fallos + revisión de privacidad de payloads. No promover a aceptación hasta P0 y P1 cerrados.

En paralelo: limpieza documental y UX/accessibilidad pueden avanzar tras acordar alcance; la integración n8n necesita credenciales/configuración separadas de remediación de RLS.

## 7. Criterios de salida antes de producción

- Cero P0 abiertos; notas privadas inaccesibles por API/REST a emprendedor y colaborador no autorizados, y nunca presentes en contexto IA para dichos roles.
- Todas las operaciones de cada ruta validadas en servidor; RLS verificada directamente con roles distintos, incluyendo modificación de IDs y rutas.
- Flujos A–E end-to-end ejecutados con datos sintéticos; evidencia de persistencia tras recarga y de ausencia de duplicados/reintentos dañinos.
- Integración de cada workflow activa y versionada, autenticación compartida segura, identidad/roles comprobados, contratos validados, callback persistente, recuperación real, logs sanitizados y health no recursivo.
- UI representa datos medidos, cálculos con denominador explícito y estados de carga/error/vacío reales; no quedan mocks sin etiqueta.
- Documento y aprendizaje tienen ciclo persistente, revisión humana, historial y permisos; archivos tienen carga firmada y controles.
- Regresión automatizada de permisos, privacidad, respuestas inválidas, errores 429/5xx, duplicados y carreras; build y lint sin errores; revisión visual y de accesibilidad en tamaños de pantalla acordados.
- Consentimiento y política de privacidad para datos enviados a OpenRouter; rotación/almacenamiento de secretos, recuperación de acceso, correo transaccional y operación/observabilidad definidos.

## 8. Recomendación final

### Requiere correcciones antes de las pruebas de aceptación

La brecha P0 de privacidad impide probar con datos personales. También faltan piezas esenciales para que RAX se comporte de principio a fin como dicen varias pantallas: flujos n8n operativos y conectados, persistencia del aprendizaje/documentos/chat global, métricas verdaderas y una suite RAX-99 que ejecute pruebas reales. Las 81 pruebas automatizadas que pasan son una buena base de reglas/servicios, pero no reemplazan RLS contra una instancia real, workflows ejecutados ni E2E de usuario.

**Límites de la auditoría:** no se modificó código; se creó este informe. No se usaron datos reales ni se llamaron proveedores externos. La revisión encontró `.env.local`; se comprobó solo la presencia de nombres de configuración y nunca se imprimieron valores secretos. El commit `7cdc97a` llegó durante la auditoría. Revisé después cambios locales sin confirmar de dashboards, calendario, exploración, métricas, documentos, notificaciones y sesiones. Las pruebas finales (`npm test`, `npm run typecheck`, `npm run lint`) se ejecutaron sobre el working tree que existía entonces; el typecheck falló como se detalla arriba. Tras esas pruebas aparecieron más cambios locales en UI y páginas, que no se alcanzaron a revisar ni verificar; por ello los resultados son una fotografía de ese momento, no certifican los cambios posteriores. El archivo vacío `Selecciona` apareció sin seguimiento y no fue modificado ni evaluado.
