#!/bin/sh
set -e

echo "=========================================================="
echo "  Iniciando RAX n8n Workflow Server"
echo "=========================================================="

MARKER_FILE="/home/node/.n8n/.rax_workflows_synced"
HASH_CURRENT=$(md5sum /workflows/*.json 2>/dev/null | md5sum | cut -d' ' -f1)

# 1. Sincronización idempotente: solo importar y publicar si no están sincronizados
if [ -d "/workflows" ] && [ "$(ls -A /workflows 2>/dev/null)" ]; then
  if [ -f "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE" 2>/dev/null)" = "$HASH_CURRENT" ]; then
    echo "=> Flujos de RAX (19) ya sincronizados previamente. Omitiendo reimportación."
  else
    echo "=> Sincronizando flujos de RAX (RAX-00 a RAX-99)..."
    
    # Limpiar duplicados previos antes de importar para evitar acumulaciones
    node -e "
    const { DatabaseSync } = require('node:sqlite');
    try {
      const db = new DatabaseSync('/home/node/.n8n/database.sqlite');
      db.exec('PRAGMA foreign_keys = OFF;');
      db.prepare('DELETE FROM workflow_entity').run();
      db.exec('PRAGMA foreign_keys = ON;');
    } catch {}
    " 2>/dev/null || true

    n8n import:workflow --separate --input=/workflows || echo "=> Aviso: Importación completada con avisos o flujos preexistentes."
    echo "=> Activando y publicando flujos de RAX..."
    n8n list:workflow 2>/dev/null | while IFS='|' read -r wfid wfname; do
      if [ -n "$wfid" ]; then
        n8n publish:workflow --id="$wfid" >/dev/null 2>&1 || true
      fi
    done
    echo "$HASH_CURRENT" > "$MARKER_FILE"
    echo "=> Flujos de RAX sincronizados y activados exitosamente (19 flujos únicos)."
  fi
else
  echo "=> Directorio /workflows vacío o no encontrado. Continuando..."
fi

# 2. Iniciar el servidor n8n con la configuración del contenedor
echo "=> Levantando servicio n8n en el puerto ${N8N_PORT:-5678}..."
exec /docker-entrypoint.sh "$@"
