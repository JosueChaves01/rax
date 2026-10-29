#!/bin/sh
set -e

echo "=========================================================="
echo "  Iniciando RAX n8n Workflow Server"
echo "=========================================================="

# 1. Importación automática de todos los workflows de RAX si existen en /workflows
if [ -d "/workflows" ] && [ "$(ls -A /workflows 2>/dev/null)" ]; then
  echo "=> Importando flujos de RAX (RAX-00 a RAX-99)..."
  n8n import:workflow --separate --input=/workflows || echo "=> Aviso: Importación completada con avisos o flujos preexistentes."
  echo "=> Flujos importados exitosamente."
else
  echo "=> Directorio /workflows vacío o no encontrado. Continuando..."
fi

# 2. Iniciar el servidor n8n con la configuración del contenedor
echo "=> Levantando servicio n8n en el puerto ${N8N_PORT:-5678}..."
exec /docker-entrypoint.sh "$@"

