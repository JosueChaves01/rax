# Limitaciones Conocidas y Dependencias Humanas

Este documento lista las restricciones técnicas, límites de cuota y dependencias operativas identificadas en la arquitectura.

---

## 1. Límites de Proveedor (OpenRouter)

1. **Modelos Gratuitos (`:free`)**:
   - Modelos como `meta-llama/llama-3.3-70b-instruct:free` presentan una cuota diaria acotada por cuenta (aprox. 50 peticiones/día sin créditos de prepago).
   - En horas pico, los proveedores subyacentes pueden responder con HTTP 429 (Rate Limit). El sistema mitiga esto mediante clasificación de errores transitorios en `RAX-90` y modelos de respaldo en `OPENROUTER_FALLBACK_MODELS`.
2. **Latencia de Inferencia**:
   - Para el chat interactivo (`RAX-02`), la respuesta del modelo puede tardar entre 3 y 15 segundos dependiendo de la congestión. Se configuró un timeout de 35 segundos en n8n y 45 segundos en el cliente Next.js.

---

## 2. Dependencias Humanas Obligatorias

1. **Revisión de Diagnóstico**:
   - La IA sugiere categorías e interpretaciones, pero es el emprendedor y el mentor quienes confirman o corrigen cada elemento.
2. **Aprobación de Acuerdos y Objetivos**:
   - Los objetivos propuestos por `RAX-07` ingresan como propuestas. Se requiere confirmación explícita de ambas partes en `mentorship_agreements` para activar la mentoría.
3. **Cierre de Experimentos**:
   - La IA analiza la evidencia observada en `RAX-13`, pero la decisión final (`MentorDecision`: continuar, reformular, profundizar, pausar o descartar) la registra el mentor humano.
4. **Comunicaciones Externas**:
   - `RAX-10` únicamente prepara borradores de recordatorio. Ningún correo electrónico o mensaje externo es enviado a terceros de manera autónoma sin autorización humana inequívoca.

---

## 3. Estado de Despliegue en el Entorno Local

- No se detectó una instancia de n8n ni Docker en el host de desarrollo local.
- Por tanto, la instalación en un servidor de n8n queda catalogada como **pendiente de importación** por el operador, siguiendo los pasos de [setup.md](setup.md) utilizando los 19 archivos JSON provistos en `workflows/n8n/`.

## 4. Bloqueo del contrato de callback

`POST /api/n8n/callback` exige `x-rax-signature` y `x-rax-timestamp` HMAC válidos. Los nodos HTTP de callback de los workflows exportados actualmente no generan esas cabeceras, por lo que el endpoint los rechazará con `401`. No se debe quitar esta autenticación para hacerlos funcionar: antes de activar los workflows, cada callback debe firmar exactamente el cuerpo enviado con `RAX_N8N_SHARED_SECRET`. Además, el endpoint aún registra metadatos de auditoría, no persiste propuestas para revisión; hasta implementar esa persistencia, no se debe anunciar que el resultado quedó procesado.

