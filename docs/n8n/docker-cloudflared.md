# Despliegue de n8n en Docker con Túnel de Cloudflare

Esta guía describe cómo levantar la instancia de **n8n con los 19 workflows de RAX pre-cargados** y expuestos a internet a través de **Cloudflare Tunnel**, utilizando el Tunnel ID configurado en `.env.local`: `7db304ca-f8b7-475b-899f-277390502c09`.

---

## 1. Arquitectura del Contenedor

El entorno está compuesto por dos servicios orquestados mediante `docker-compose.yml`:

```
Internet ──► Cloudflare Edge (DNS) 
                   │ (Túnel cifrado sin abrir puertos en el router)
                   ▼
             [rax-cloudflared] (contenedor cloudflare/cloudflared)
                   │ (Red interna Docker: rax-network)
                   ▼
             [rax-n8n] (puerto interno 5678)
                   ├── 19 Workflows de RAX auto-importados
                   ├── OpenRouter API Gateway
                   └── Conexión segura a RAX (host.docker.internal:3000)
```

1. **`rax-n8n`**:
   - Basado en `docker.n8n.io/n8nio/n8n:latest` con `Dockerfile.n8n`.
   - Incorpora el script de entrada `scripts/entrypoint-n8n.sh` que ejecuta automáticamente `n8n import:workflow --separate --input=/workflows` al iniciar el contenedor.
   - Conecta con la aplicación Next.js mediante `host.docker.internal:3000`.
   - Lee las credenciales de OpenRouter y el secreto HMAC directamente de las variables de entorno de RAX.

2. **`rax-cloudflared`**:
   - Basado en `cloudflare/cloudflared:latest`.
   - Configurado con `cloudflared/config.yml` y el ID `7db304ca-f8b7-475b-899f-277390502c09`.
   - Enruta el tráfico entrante de Cloudflare hacia `http://n8n:5678`.

---

## 2. Requisitos Previos

1. **Docker Desktop** (o Docker Engine con plugin `docker compose`).
2. Archivo `.env.local` configurado con:
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-...
   CLOUDFLARED_TUNNEL_ID=7db304ca-f8b7-475b-899f-277390502c09
   ```

---

## 3. Modos de Autenticación del Túnel Cloudflare

### Opción A: Con Token de Cloudflare Zero Trust (Recomendada)
Si creaste el túnel desde el panel web de Cloudflare Zero Trust (**Networks → Tunnels**):
1. Copia el token de conexión del túnel.
2. Agrega la variable en tu `.env.local`:
   ```bash
   CLOUDFLARED_TUNNEL_TOKEN=eyJhIjoi...
   ```
3. El contenedor detectará el token y conectará el túnel automáticamente.

### Opción B: Con Archivo de Credenciales JSON
Si creaste el túnel mediante el CLI `cloudflared tunnel create`:
1. Copia el archivo `~/.cloudflared/7db304ca-f8b7-475b-899f-277390502c09.json` hacia:
   `cloudflared/credentials.json`
2. El contenedor montará el archivo y usará `cloudflared/config.yml`.

---

## 4. Iniciar los Servicios

### En Windows (PowerShell)
```powershell
.\scripts\docker-start.ps1
```

### En Linux / macOS (Bash)
```bash
chmod +x scripts/docker-start.sh
./scripts/docker-start.sh
```

### O directamente con Docker Compose:
```bash
# 1. Construir la imagen con los workflows pre-cargados
docker compose build n8n

# 2. Levantar los contenedores en segundo plano
docker compose up -d

# 3. Ver los logs de n8n y del túnel
docker compose logs -f
```

---

## 5. Verificación

1. **Acceso Local**:
   Abre [http://localhost:5678](http://localhost:5678). Al entrar a **Workflows**, verás los 19 flujos (`RAX-00` a `RAX-99`) ya importados y listos.
2. **Acceso Público**:
   El hostname público asignado a tu túnel en Cloudflare (ej. `https://n8n.tu-dominio.com/webhook/rax-health`) responderá con el reporte de salud `{ "status": "healthy" }`.
3. **Conexión con RAX**:
   En `.env.local` de tu aplicación Next.js, configura:
   ```bash
   N8N_WEBHOOK_BASE_URL=https://n8n.tu-dominio.com/
   ```

