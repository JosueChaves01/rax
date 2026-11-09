# Encender el flujo B2B en producción

Guía para Josue. El flujo B2B (el mentor crea el proyecto, invita a sus clientes y conduce
Entrevista → Sesión 1 → Ciclo → Cierre) está detrás de la bandera `RAX_B2B_FLOW`. Con la bandera
apagada la app funciona como hoy. Sigue los pasos en este orden: la app nueva espera las tablas y
políticas de las migraciones, y el respaldo de datos espera que las migraciones ya estén aplicadas.

## 1. Antes de empezar

- Haz un respaldo de la base (Supabase → Database → Backups) o anota el punto de restauración.
- Confirma que el último deploy de `main` está en Vercel con la bandera **apagada**. Ese código ya
  sabe leer las tablas nuevas, así que las migraciones no lo rompen.
- Confirma que producción ya tiene todas las migraciones anteriores al 7 de noviembre de 2026
  (`supabase migration list` o la tabla `supabase_migrations.schema_migrations`).

## 2. Aplicar las migraciones, en este orden

Con `supabase db push` se aplican solas en orden de nombre. Si las aplicas a mano (SQL Editor),
respeta este orden y no saltes ninguna:

| # | Archivo | Qué hace |
| --- | --- | --- |
| 1 | `20261107000001_b2b_pivot_core.sql` | Núcleo B2B: `projects.mentor_id`, `cycle_stage`, `mode`; invitaciones, notificaciones, perfil y RAG del mentor, intake, evaluaciones; políticas por rol y la función `rax_b2b_backfill()` |
| 2 | `20261109000101_session_room_clients.sql` | Los clientes entran a la llamada de la sesión (señalización y transcripción) |
| 3 | `20261109000103_session_live_notes.sql` | Las notas en vivo pasan a `session_live_notes` (solo el mentor) |
| 4 | `20261109000104_client_read_hardening.sql` | El cliente deja de leer la fila completa de `mentor_sessions` (lee la vista `client_sessions`); comentarios y tareas del cliente acotados |
| 5 | `20261109000201_intake_transcript.sql` | La transcripción del intake queda privada (solo el servidor) |

Si al momento de aplicar hay otros archivos `20261107…` o `20261109…` en `supabase/migrations`
(por ejemplo de la Fase 4 o 5 de Dev B), aplícalos también, siempre en orden de nombre.

Todas las migraciones se pueden volver a correr sin error (`if not exists`, `drop policy if exists`).

## 3. Pasar los datos al modelo nuevo

En el SQL Editor, con el rol `postgres`:

```sql
select public.rax_b2b_backfill();
```

Devuelve cuántas filas tocó cada paso, por ejemplo `{"mentors": 12, "clients": 15, "stages": 9, "briefs": 7}`:

- `mentors`: proyectos que reciben `mentor_id` desde su asignación activa.
- `clients`: dueños actuales que pasan a ser clientes del proyecto (`project_members.role = client`).
- `stages`: proyectos que avanzan de etapa según sus revisiones completadas.
- `briefs`: resúmenes de diagnóstico copiados como brief revisado.

Se puede repetir: no duplica nada. Si cambia algo después (por ejemplo, se asigna un mentor más con
el flujo viejo), vuelve a correrla justo antes del paso 4.

## 4. Encender la bandera

En Vercel → Project → Settings → Environment Variables:

- `RAX_B2B_FLOW` = `on` en **Production** (y en Preview si quieres probar antes ahí).
- Vuelve a desplegar el último deploy de producción (Deployments → ⋯ → Redeploy) para que tome la
  variable.

Para volver atrás basta con borrar la variable (o ponerla en `off`) y redesplegar. Las migraciones
no hace falta revertirlas: el flujo viejo funciona con ellas aplicadas.

## 5. Prueba rápida por rol

Usa una cuenta de mentor y dos de cliente de prueba. Marca cada punto.

### Mentor

- [ ] Registrarse y elegir «Soy mentor» en `/bienvenida`: queda activo sin aprobación y llega a `/app/mentor/perfil`.
- [ ] Completar el perfil y subir un documento a su base de conocimiento.
- [ ] Crear un proyecto individual y uno grupal desde `/app/mentor`, invitando por correo.
- [ ] Ver el brief del intake cuando el cliente termina la entrevista y completar el contexto faltante.
- [ ] Agendar la Sesión 1, abrir la sala (`/app/llamada/<id>`), escribir notas en vivo, guardar el acuerdo y los compromisos por persona.
- [ ] Publicar material para todo el grupo y para una persona; crear una evaluación.
- [ ] Usar el asistente del mentor (herramientas de proyecto) sin errores.

### Cliente

- [ ] Registrarse con el correo invitado: la invitación aparece en la campana y en el inicio; aceptarla.
- [ ] Hacer la entrevista de intake; ver solo su avance, nunca el brief.
- [ ] Ver «Sesiones» con fecha y agenda, sin la preparación del mentor.
- [ ] Entrar a la llamada de la sesión; ver el acuerdo confirmado, nunca las notas en vivo.
- [ ] Ver «Material» solo con lo publicado para él o para el grupo; comentar un material.
- [ ] Responder una evaluación.

### Cliente del grupo (segunda cuenta)

- [ ] No ve el material publicado solo para la otra persona ni sus comentarios.
- [ ] Ve los compromisos del grupo, pero no las tareas propias del mentor.

### Usuario existente (dato migrado)

- [ ] Un emprendedor que ya tenía proyecto entra y lo ve como cliente, con su mentor.
- [ ] Un mentor que ya tenía asignaciones ve esos proyectos en su bandeja.

## 6. Límites conocidos

- **Llamada grupal en malla P2P, máximo 4 personas** (mentor incluido, `MESH_MAX_PARTICIPANTS`).
  No hay SFU: con más gente la calidad cae. Un SFU (LiveKit u otro) queda como fase aparte.
- **Sin TURN propio** salvo que se configuren `TURN_URLS`, `TURN_USERNAME` y `TURN_CREDENTIAL`;
  detrás de redes corporativas estrictas la llamada puede no conectar.
- **La asistencia se guarda como evento de auditoría** (`session.confirmed` con
  `meta.attendance = true`), no en una tabla propia. Sirve para mostrarla, no para reportes.
- **La dueña de un proyecto migrado sigue leyendo la fila completa de `mentor_sessions`** por la
  política vieja `sessions_select` (`can_read_project` incluye a la dueña). Los proyectos creados
  por el mentor no tienen dueña, así que no les afecta. Se corrige al borrar el flujo viejo (abajo).
- `projects.owner_id` queda vacío en los proyectos B2B nuevos; el código lo sigue tipando como requerido.

## 7. Código a borrar cuando la bandera esté encendida en todos lados

No se borra todavía porque con la bandera apagada todo esto sigue en uso. Cuando producción y
preview lleven un tiempo con `RAX_B2B_FLOW=on` sin volver atrás:

**Administración (decisión 6.3: el admin deja de existir)**
- `app/app/admin/**`, `app/app/reportes/page.tsx`, `shared/ui/admin-operations-view.tsx`, `shared/ui/reports-view.tsx`.
- `lib/services/admin.ts` (`reviewMentorApplication`, `assignMentor`, `revokeMentor`) y sus acciones en `app/actions.ts` (`assignMentorAction`, `reviewMentorAction`, `revokeMentorAction`).
- `profiles.mentor_status` y su uso en `app/app/page.tsx`, `app/bienvenida/page.tsx`, `lib/services/onboarding.ts`, `lib/services/mentorship-relation.ts` y el mapeo de `lib/data/supabase-repository.ts`.
- El rol `admin` en el menú y en `lib/authz.ts` (`admin.manage`). El valor del enum se queda.

**Diagnóstico (decisión 6.4)**
- `lib/services/diagnosis.ts`, `features/diagnosis/rules.ts`, `app/app/p/[id]/diagnostico/**` y las acciones `addComment/addItem/changeItem/confirmSummary/editSummary`.
- `getWorkspace` deja de crear el diagnóstico (`ensureDiagnosis` en `lib/services/projects.ts`).
- Tablas `diagnoses`, `diagnosis_items`, `diagnosis_item_history`: quedan sin uso y se borran en una migración posterior.

**Revisiones y etapas del flujo viejo**
- `requestReview`, `completeFirstReview`, `completeSecondReview`, `suggestFirstReview` (botón «Proponer el acuerdo con IA» del cierre de la primera revisión) en `lib/services/mentoring.ts` y sus acciones.
- Páginas de etapa: `app/app/p/[id]/{orientar,validacion,decidir,evaluacion,historial,mentoria,acuerdos}`, `stage-nav.tsx`, `cycle-track.tsx`, `features/projects/stages.ts`, `lib/services/next-action.ts` y la rama vieja de `app/app/p/[id]/layout.tsx`.
- Hipótesis y experimentos (decisión 6, punto 1): `lib/services/validation.ts` salvo tareas.
- Tipos de sesión `first_review`, `second_review` y `exploratory` en las etiquetas y en `V.SessionKind` (el enum de Postgres se queda).
- `decideCompatibility` y `transitionMentorshipStage` en `lib/services/mentorship-relation.ts` (hoy `ensureMentorshipRelation` todavía marca la compatibilidad como confirmada).

**Base de datos (una migración nueva de limpieza)**
- Reemplazar las ~20 referencias a `is_admin()` en las políticas (`20261028000002_rax_security.sql`, `20261028000004_rax_onboarding.sql`, `20261029000001_rax_mentorship_core.sql`, `20261101000002_project_soft_delete.sql`) y después borrar la función.
- Quitar a la dueña de `sessions_select` (o reemplazar `can_read_project` por mentor del proyecto + miembro colaborador) para cerrar el último acceso de clientes a la fila completa.
- Borrar `mentorship_relations.compatibility_status`, `compatibility_rationale` y `compatibility_decided_at`.
- Borrar `mentor_sessions.live_notes` y `live_notes_updated_at` (retiradas en `20261109000103`), quitando antes su mapeo en `lib/data/supabase-repository.ts`.
- Borrar `profiles.mentor_status` y, si ya nada lo usa, `projects.owner_id`.

**Ya retirado en la Fase 5 (sin uso en ningún modo)**
- Pantallas que solo redirigían: `/app/exploracion`, `/app/sugerencias`, `/app/relaciones`, `/app/evaluacion` (ahora redirigen a `/app` desde `next.config.ts`).
- `lib/ai/exploration-ai.ts` y las acciones de exploración y emparejamiento sin pantalla (`completeExplorationAction`, `completeExplorationAndCreateProjectAction`, `loadExplorationContextAction`, `generateMentorshipExplorationWithAiAction`, `decideCompatibilityAction`, `initiateMentorshipRelationAction`, `transitionMentorshipStageAction`).
