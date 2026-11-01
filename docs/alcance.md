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

Pagos; elección de mentor por el emprendedor; videollamadas, correo y tiempo real; analítica avanzada fuera de los reportes de administración; varios ciclos encadenados por proyecto.
