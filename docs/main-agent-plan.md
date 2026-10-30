# Agente principal de RAX

## Objetivo

Todos los chats de RAX deben comunicarse con un solo agente principal. El agente recibe el rol autenticado, el proyecto y la etapa, sección, tarea, paso o campo que la persona está usando. Puede responder preguntas, consultar contexto autorizado, invocar el flujo especializado apropiado y preparar valores para formularios. Esto debe funcionar para mentores y para emprendedores/aprendices.

El agente no inventa hechos, evidencia, resultados ni estados de ejecución. Cuando falten datos, pregunta o marca el campo como desconocido. Las propuestas para guardar, aprobar, enviar, cerrar una etapa o cambiar datos requieren confirmación humana y quedan auditadas.

## Estado actual

**No está operativo.** `/app/chat`, aprendizaje y conversación de proyecto ya usan la misma acción server-side y guardan sus turnos en un hilo privado por usuario/proyecto, separado del historial de entrevista. n8n no está conectado/verificado; RAX-02 está apagado y las capacidades especializadas no invocan flujos. La UI no debe afirmar que n8n está activo ni que el agente principal ya puede ejecutar acciones. La migración de persistencia está escrita, pero aún no se ha ejecutado contra PostgreSQL.

## Arquitectura objetivo

1. **Clientes de chat comunes:** chat general, conversación del proyecto, aprendizaje y accesos contextuales en formularios envían mensajes al mismo contrato de agente. Los formularios pasan además `{projectId, flowId, stage, section, taskId?, fieldPath?, currentValue?, fieldSchema?}`.
2. **Puerta de RAX:** un Server Action/API obtiene actor y permisos de Supabase en el servidor. El cliente nunca decide el rol, la pertenencia al proyecto, los permisos, las herramientas disponibles ni los datos sensibles incluidos.
3. **Agente principal RAX-02:** clasifica intención y contexto, decide si responder, preguntar o solicitar una herramienta especializada. Puede encadenar herramientas con límites de tiempo/pasos y devuelve texto, propuestas estructuradas de campos, incertidumbres y acciones solicitadas.
4. **Registro de capacidades:** catálogo versionado de los workflows RAX-00..15, RAX-90, RAX-91 y RAX-99, con esquemas de entrada/salida, permisos, modo (`read`, `draft`, `write`) y estado operativo. RAX traduce nombres lógicos a IDs configurados de n8n; no acepta un ID arbitrario del modelo.
5. **Ejecutor especializado:** cada capacidad se invoca por sub-workflow desde RAX-02 con un payload mínimo. n8n no obtiene acceso directo a Supabase ni autoridad basada en un `actor` declarado por el modelo; RAX vuelve a comprobar autorización antes de persistir resultados.
6. **Aplicación de cambios:** el agente devuelve propuestas con `fieldPath`, valor sugerido, evidencia/cita, incertidumbre y `needsHumanApproval`. La UI muestra previsualización y permite aplicar/descartar; transiciones sensibles (aprobaciones, estados, notificaciones externas) requieren confirmación explícita.
7. **Trazabilidad:** mensajes, ejecución, versión de flujo/modelo, uso, errores y decisión humana se registran sin guardar secretos ni prompts completos. El contexto respeta RLS, privacidad de notas y permisos de conversación compartida.

## Catálogo de capacidades a conectar

| Workflow | Capacidad expuesta al agente | Estado de ejecución |
|---|---|---|
| RAX-00 | Diagnóstico de disponibilidad de integración | No conectado; health local de RAX no acredita n8n |
| RAX-01 | Ingesta/enrutamiento de eventos internos | No disponible; ruta explícitamente responde no disponible |
| RAX-02 | Agente principal: chat, selección y coordinación de herramientas | Chat existente sin herramientas; n8n no operativo |
| RAX-03 | Memoria/resumen de proyecto | Definido, no conectado |
| RAX-04 | Diagnóstico y extracción de información | Definido, no conectado |
| RAX-05 | Preparación de sesión para mentor | Definido, no conectado |
| RAX-06 | Síntesis de sesión y compromisos | Definido, callback/persistencia por completar |
| RAX-07 | Objetivos y plan de acción | Definido, no conectado |
| RAX-08 | Propuestas de tareas | Definido, no conectado |
| RAX-09 | Bloqueos y próxima intervención | Definido, no conectado |
| RAX-10 | Borradores de recordatorio | Definido, no conectado; nunca envío sin confirmación |
| RAX-11 | Recursos metodológicos | Definido, no conectado |
| RAX-12 | Hipótesis y diseño de experimento | Definido, no conectado |
| RAX-13 | Análisis de evidencia/resultados | Definido, no conectado |
| RAX-14 | Evaluación de ciclo de mentoría | Definido, no conectado |
| RAX-15 | Métricas operativas | Definido, no conectado |
| RAX-90 | Clasificación y registro de errores | Definido, no conectado |
| RAX-91 | Reintento administrativo controlado | No disponible hasta que exista ejecución real e idempotencia verificable |
| RAX-99 | Suite de evaluación | No reportar PASS hasta ejecutar aserciones reales |

## Fases de implementación

1. **Contrato y contexto común:** consolidar los cuatro puntos de entrada de chat y el contexto de campo; mantener los estados actuales honestos.
2. **Agente principal con herramienta segura:** conectar RAX-02 a capacidades existentes de RAX (inicialmente diagnóstico, sesión, hipótesis/experimento y tareas) con permisos de servidor y resultados en borrador.
3. **Cobertura del catálogo:** adaptar uno a uno los workflows existentes a sub-workflows invocables, contratos tipados, timeout, manejo de errores e idempotencia donde aplique.
4. **Persistencia y confirmación:** guardar chat contextual y propuestas, construir vistas para aplicar/descartar campos, y registrar actor/decisión.
5. **Verificación de operación:** importar y activar en un n8n de staging, configurar secretos fuera del repositorio, probar cada herramienta con datos sintéticos, roles distintos, duplicados, reintentos y callback firmado.

## Criterios de salida

- Cada chat entra al mismo agente y hereda solamente el contexto que el actor puede consultar.
- El agente puede identificar y ejecutar cada flujo publicado en el catálogo, o explica que está no disponible sin simular éxito.
- Las propuestas rellenan campos concretos con origen/incertidumbre y se pueden revisar antes de guardar.
- Ningún resultado del modelo modifica aprobaciones, decisiones humanas o evidencia verificada sin consentimiento.
- Cada capacidad pasa pruebas de contrato, permisos, privacidad, duplicados y error; luego un E2E en n8n de staging.
