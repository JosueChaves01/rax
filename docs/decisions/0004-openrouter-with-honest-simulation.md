# 0004 · OpenRouter con modelo gratuito y simulación honesta

Fecha: 2026-10-28 · Estado: aceptada

## Contexto
Se pidió dejar la IA lista para OpenRouter con un modelo gratuito. Los modelos gratuitos tienen límites y disponibilidad variable.

## Decisión
- Puerto `AiProvider` con `OpenRouterProvider` (fetch directo, sin SDK adicional) y `SimulatedProvider`.
- Modelo configurable por `OPENROUTER_MODEL`; por defecto `meta-llama/llama-3.3-70b-instruct:free`.
- Salida JSON validada con zod, un reintento de corrección, y error explícito si falla.
- Sin clave → simulación, siempre etiquetada. Con clave y falla → error visible, nunca simulación silenciosa.

## Consecuencias
- Cero costo para empezar; se puede cambiar a un modelo pago cambiando una variable.
- Si el modelo gratuito deja de existir, hay que actualizar la variable.
