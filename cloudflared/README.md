# Configuración del Túnel Cloudflare para RAX n8n

Este directorio contiene la configuración para exponer de manera segura la instancia de n8n hacia internet mediante **Cloudflare Tunnel**, utilizando el túnel `7db304ca-f8b7-475b-899f-277390502c09`.

---

## Modos de Operación Admitidos

### Opción 1: Mediante Token de Túnel (Recomendado por Cloudflare Dashboard)
Si creaste el túnel desde el panel de Cloudflare Zero Trust (**Networks → Tunnels**):
1. En el panel de Cloudflare, copia el token del túnel.
2. Agrégalo a tu `.env.local`:
   ```bash
   CLOUDFLARED_TUNNEL_TOKEN=eyJhIjoi...tu_token_aqui...
   ```
3. El contenedor detectará automáticamente el token y levantará el túnel sin necesidad de archivos adicionales.

### Opción 2: Mediante Archivo de Credenciales (`credentials.json`)
Si creaste el túnel con el CLI de cloudflared (`cloudflared tunnel create rax-n8n`):
1. Copia tu archivo de credenciales generado por cloudflared (ubicado habitualmente en `~/.cloudflared/7db304ca-f8b7-475b-899f-277390502c09.json`) a este directorio con el nombre:
   `cloudflared/credentials.json`
2. El contenedor montará el archivo en `/etc/cloudflared/credentials.json` y se conectará usando `config.yml`.

---

## Enrutamiento en Cloudflare DNS
En el panel de Cloudflare Zero Trust:
1. En la pestaña **Public Hostname** de tu túnel `7db304ca-f8b7-475b-899f-277390502c09`:
   - **Subdomain**: `n8n` (o el que elijas, ej: `n8n.tu-dominio.com`)
   - **Service Type**: `HTTP`
   - **URL**: `n8n:5678`
2. En `.env.local` de RAX, configura:
   ```bash
   N8N_WEBHOOK_BASE_URL=https://n8n.tu-dominio.com/
   ```

