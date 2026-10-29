# Políticas de Seguridad, Autorización y Privacidad

Este documento define las medidas y controles de seguridad implementados en la integración entre RAX y n8n.

---

## 1. Principio de Menor Privilegio

1. **Aislamiento de la Base de Datos**: n8n **no** tiene credenciales de acceso directo (usuario/contraseña ni Service Role Key) a la base de datos Postgres de Supabase. Todas las lecturas y escrituras pasan a través de los contratos y endpoints autenticados de RAX.
2. **Autorización basada en Servidor**: La autorización procede de las sesiones y roles de RAX (`entrepreneur`, `mentor`, `admin`). n8n nunca confía ciegamente en IDs provistos en el cuerpo del webhook si no provienen de la firma HMAC de RAX.
3. **Propuestas no Vinculantes**: Ningún flujo de n8n ni modelo de OpenRouter puede mutar directamente el estado de un diagnóstico, objetivo o experimento a `confirmed` o `approved`. Toda entidad creada ingresa con `needsHumanApproval = true`.

---

## 2. Autenticación de Red: HMAC-SHA256

Todas las solicitudes entrantes a los webhooks de n8n y los callbacks devueltos a RAX deben incluir:

- `x-rax-signature`: `sha256=HMAC_SHA256(timestamp + "." + body, secret)`
- `x-rax-timestamp`: Segundos epoch actuales en formato Unix.

### Reglas de Validación
1. Si falta alguna cabecera → Rechazo inmediato con HTTP 401.
2. Si `|now - timestamp| > 300` segundos → Rechazo inmediato por caducidad (protección anti-replay).
3. Comparación en tiempo constante (`timingSafeEqual`) en `lib/n8n/security.ts` para mitigar ataques de temporización.

---

## 3. Privacidad y Aislamiento de Datos

1. **Notas Privadas del Mentor**:
   - En `lib/ai/context.ts` y en el nodo de sanitización de `RAX-02`, si el actor que realiza la solicitud es el emprendedor (`actor.role === 'entrepreneur'`), las notas del mentor se eliminan antes de enviar el prompt al LLM.
2. **Conversaciones Privadas**:
   - La conversación del emprendedor solo se comparte con el mentor si la bandera del proyecto `shareConversationWithMentor` es `true`.
3. **Sanitización de Trazas**:
   - En `RAX-90` (gestión de errores), se sanitizan automáticamente cadenas de texto para eliminar posibles claves de API (`key=REDACTED`) y evitar la filtración de credenciales en logs de ejecución.

