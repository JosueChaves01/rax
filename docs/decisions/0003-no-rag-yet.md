# 0003 · Sin RAG ni base vectorial por ahora

Fecha: 2026-10-28 · Estado: aceptada

## Contexto
El contexto de un proyecto en Fase Cero cabe en pocos miles de tokens: mensajes recientes, elementos vigentes y notas.

## Decisión
Selección contextual determinista con ventanas acotadas (`lib/ai/context.ts`), priorizando lo revisado por personas. Sin embeddings, base vectorial, colas ni n8n.

## Consecuencias
- Menos piezas, sin costo extra, comportamiento reproducible.
- Revisar cuando haya documentos largos (actas, encuestas) o proyectos con cientos de mensajes.
