# Contexto de producto

## Problema

Quien empieza un emprendimiento suele mezclar lo que sabe, lo que supone y lo que desea. Las herramientas de IA generalistas devuelven planes pulidos que esconden esa mezcla y "inventan" mercado, clientes o cifras. Los mentores, por su parte, llegan tarde: cuando el plan ya está escrito sobre supuestos sin revisar.

## Propuesta

RAX ordena la información del emprendedor sin perder trazabilidad y lleva a la persona hasta un primer experimento con criterios definidos antes de mirar resultados.

1. **La IA estructura, no inventa.** Archiva lo dicho con su cita literal, separa afirmaciones, observaciones, supuestos y desconocidos, y convierte el "no sé" en preguntas abiertas.
2. **La persona tiene la última palabra** sobre su diagnóstico: confirma, corrige o rechaza cada elemento; nada se borra, todo queda en el historial.
3. **El mentor entra temprano**: primera revisión del diagnóstico antes de diseñar hipótesis, y segunda revisión al interpretar resultados.
4. **Validar es comprobar, no confirmar**: hipótesis concretas, experimentos pequeños, criterio de éxito y de descarte fijados al iniciar.

## Usuarios

| Rol | Necesita | En RAX |
|---|---|---|
| Emprendedor/a | Ordenar ideas y saber qué probar primero | Conversación, diagnóstico, validación, tareas |
| Mentor/a | Contexto rápido y fiable para aconsejar | Briefing, notas, priorización, aprobación de hipótesis, decisiones |
| Administración | Asignar mentores y ver el estado general | Panel de metadatos, sin contenido de los proyectos |

## Alcance de la Fase Cero

Dentro: los 12 pasos del flujo (ver [user-flows.md](user-flows.md)), un mentor asignado por proyecto, IA en español.

Fuera (por ahora): pagos, marketplace de mentores, agenda o videollamadas, notificaciones por correo, colaboración en tiempo real, analítica avanzada, RAG sobre documentos y colas. La plataforma sí requiere un agente principal compartido entre los chats, con acceso controlado al catálogo de flujos RAX; su plan y estado están en [main-agent-plan.md](main-agent-plan.md). La integración n8n actual todavía no está operativa.

## Principios de producto

- Honestidad visible: lo simulado y lo no verificado se etiquetan en la interfaz.
- Ninguna aprobación del mentor se simula.
- Lo confirmado o corregido por una persona prevalece sobre cualquier interpretación de la IA.
- Español claro, sin jerga de consultoría.
