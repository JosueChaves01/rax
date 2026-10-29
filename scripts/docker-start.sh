#!/bin/bash
set -e

echo "=========================================================="
echo "  Levantando RAX n8n + Cloudflare Tunnel"
echo "=========================================================="

if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker no está instalado o no se encuentra en el PATH."
    exit 1
fi

echo "=> Construyendo contenedor con los 19 workflows de RAX..."
docker compose build n8n

echo "=> Levantando servicios (n8n + cloudflared)..."
docker compose up -d

echo "=> Servicios iniciados exitosamente."
echo "=> n8n accesible localmente en: http://localhost:5678"
echo "=> Logs del túnel Cloudflare:"
docker compose logs cloudflared --tail 20

