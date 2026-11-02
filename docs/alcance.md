# Alcance de RAX

Versión de trabajo: [RAX · Alcance de la plataforma](https://claude.ai/artifact/DCxkiRKhEBvJGKqeYbk7Qb) (1 de noviembre de 2026).

## Qué es

RAX lleva a una persona emprendedora o estudiante desde una idea confusa hasta una decisión basada en evidencia, en un solo ciclo guiado por un mentor humano y un agente de IA. No es un gestor de proyectos genérico, ni un marketplace de mentores, ni un curso: lo que no ayuda a cerrar ese ciclo es secundario.

## El ciclo

El avance se mide solo con las 4 etapas de `features/projects/stages.ts`, derivadas de la fase real. Inicio, tableros, pendientes y agente muestran la misma etapa.

| Etapa | Se cierra cuando | Quién mueve |
|---|---|---|
| 1 · Entender | El emprendedor confirma el resumen del diagnóstico | Emprendedor + IA |
| 2 · Orientar | El mentor completa la primera revisión y se prioriza un problema | Mentor (administración asigna antes) |
| 3 · Probar | El mentor aprueba la hipótesis y el experimento registra resultado | Emprendedor, con aprobación del mentor |
| 4 · Decidir | El mentor registra la decisión de la segunda revisión | Mentor |

Acuerdo de mentoría, objetivos y evaluación del ciclo enriquecen el ciclo pero no lo frenan.

## Cómo trabaja el mentor

El mentor toma tres decisiones con su nombre: el acuerdo de la primera revisión (con el problema a investigar primero), la aprobación de la hipótesis y la decisión de la segunda revisión. Todo lo demás lo prepara RAX:

1. El emprendedor pide la revisión desde la etapa, con fecha opcional. El briefing con IA se prepara solo en ese momento.
2. Se reúnen en la llamada de la sesión (o fuera, y se escriben notas). Al colgar, la síntesis se arma sola desde la transcripción.
3. El mentor revisa un único borrador de cierre (acuerdo y prioridad, o decisión) y lo confirma. Los compromisos del emprendedor se vuelven tareas.

«Agendar» es solo para sesiones de seguimiento. Cada sesión se trabaja dentro de su proyecto; el menú Sesiones es la agenda. El mentor llega asignado por la administración, así que no hay etapa de compatibilidad.

## Entrada por rol

- **Emprendedor** → `/app`: sus proyectos con las 4 etapas, a quién le toca y el siguiente paso.
- **Mentor** → `/app`: la bandeja (revisiones e hipótesis pedidas) y sus proyectos.
- **Administración** → `/app/admin`: panel de operaciones.

## Módulos

| Lugar | Módulos |
|---|---|
| Núcleo (menú «Tu trabajo») | Inicio, proyecto (`/app/p/[id]`), Asistente IA, Cartera del mentor, Operaciones |
| Apoyo (menú) | Tareas, Sesiones (con calendario), Documentos, Aprendizaje, Recursos (mentor), Reportes (admin) |
| Dentro del proyecto | Acuerdo y objetivos, evaluación del ciclo |
| Fuera (la ruta redirige) | Exploración con compatibilidad de mentor, Sugerencias de IA, Relaciones, Evaluación global |

El menú vive en `shared/ui/nav-items.tsx`; la guía del agente (`lib/ai/platform-guide.ts`) debe coincidir.

## Fuera de alcance por ahora

Pagos; elección de mentor por el emprendedor; avisos por correo; analítica avanzada fuera de los reportes de administración; varios ciclos encadenados por proyecto. (Las videollamadas 1 a 1 con transcripción sí entran, dentro de cada sesión de mentoría.)
