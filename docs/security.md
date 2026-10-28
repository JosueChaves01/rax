# Seguridad

> El prototipo usa acceso DEMO (cookie `rax_demo_user`) que **no es autenticación**: cualquiera puede elegir cualquier perfil. No exponer con datos reales.

## Autorización en dos capas

1. **Servidor** (`lib/authz.ts` + `guard()` en `lib/services/base.ts`): cada caso de uso resuelve la relación con el proyecto desde los datos (dueño, colaborador, mentor asignado activo) y consulta la matriz. Ocultar botones en la interfaz es solo comodidad.
2. **Base de datos** (`supabase/migrations/20261028000002_rax_security.sql`): RLS en todas las tablas, mismas reglas. Así, aunque una ruta del servidor tuviera un error, la base no entrega datos ajenos.

## Matriz de permisos

| Acción | Dueño | Colaborador | Mentor asignado | Admin |
|---|:-:|:-:|:-:|:-:|
| Leer proyecto | ✓ | ✓ | ✓ | metadatos |
| Escribir en la conversación | ✓ | ✓ | | |
| Leer la conversación | ✓ | ✓ | si el dueño la comparte | |
| Editar diagnóstico | ✓ | ✓ | | |
| Confirmar resumen | ✓ | | | |
| Comentar / pedir aclaración | ✓ | ✓ | ✓ | |
| Priorizar problemas | ✓ | | ✓ | |
| Pedir revisión | ✓ | | | |
| Notas y decisión de mentoría | | | ✓ | |
| Proponer hipótesis / diseñar experimento | ✓ | ✓ | ✓ | |
| Aprobar hipótesis | | | ✓ | |
| Iniciar experimento | ✓ | | | |
| Registrar resultado / evidencias | ✓ | ✓ | | |
| Asignar mentores, ver panel | | | | ✓ |

Un mentor sin asignación activa no ve nada. La administración no lee contenido de proyectos.

## Garantías en la base de datos

- Sin políticas de DELETE: nada se borra desde el cliente.
- `diagnosis_item_history`, `audit_events` y `conversations` no son escribibles por `authenticated`; el historial lo escribe un trigger.
- `guard_diagnosis_item`: el mentor solo cambia prioridad o pide aclaración; las escrituras del servidor (IA) no pisan contenido revisado ni registran evidencia/decisiones/correcciones.
- `guard_hypothesis`: solo el mentor asignado aprueba, y queda en `approved_by`.
- `guard_experiment`: métrica y criterios inmutables tras iniciar; solo el dueño inicia.
- `guard_profile_role`: solo la administración cambia roles.
- Storage: bucket `evidence` privado, ruta `<project_id>/archivo`, 10 MB, tipos permitidos; lectura para quien puede leer el proyecto, subida para miembros.

## Entradas

- Toda entrada de server actions pasa por zod (`lib/validation/inputs.ts`) con longitudes máximas.
- React escapa el contenido; no se usa `dangerouslySetInnerHTML`.
- Errores al cliente: mensajes genéricos por código (`forbidden`, `not_found`, `conflict`, …), sin trazas.

## Secretos

- `OPENROUTER_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` solo en servidor; `lib/ai/openrouter.ts` importa `server-only`.
- La auditoría no guarda claves, cabeceras ni prompts completos.

## Pendiente antes de usar con personas reales

- Autenticación real (Supabase Auth) y eliminar el acceso DEMO en producción.
- Rate limiting por usuario en la conversación (costo y abuso).
- Política de privacidad y consentimiento para enviar texto a un proveedor de IA externo.
- Escaneo de archivos subidos.
- Revisión de seguridad independiente.
