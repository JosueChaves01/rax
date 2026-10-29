#!/bin/bash
set -e

echo "=========================================================="
echo "  Levantando RAX n8n + Cloudflare Tunnel"
echo "=========================================================="

if ! command -v docker &> /dev/null; then
    echo "[ERROR] El comando 'docker' no se encuentra en el PATH."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "[ERROR] El motor de Docker no está en ejecución. Inicia Docker Desktop o el servicio dockerd."
    exit 1
fi

ENV_FILE=".env.local"
if [ ! -f ".env.local" ]; then
    if [ -f ".env" ]; then
        ENV_FILE=".env"
    fi
fi
echo "=> Usando variables desde: $ENV_FILE"

echo "=> Construyendo contenedor con los 19 workflows de RAX..."
docker compose --env-file "$ENV_FILE" build n8n

echo "=> Levantando servicios (n8n + cloudflared)..."
docker compose --env-file "$ENV_FILE" up -d

echo "=> Servicios iniciados exitosamente."
echo "=> n8n accesible localmente en: http://localhost:5678"
echo "=> Logs del túnel Cloudflare:"
docker compose --env-file "$ENV_FILE" logs cloudflared --tail 15
