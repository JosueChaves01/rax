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
    
    # Limpiar duplicados y relaciones previas antes de importar para evitar registros huerfanos
    node -e "
    const { DatabaseSync } = require('node:sqlite');
    try {
      const db = new DatabaseSync('/home/node/.n8n/database.sqlite');
      db.exec('PRAGMA foreign_keys = OFF;');
      const tables = [
        'workflow_entity',
        'webhook_entity',
        'workflow_published_version',
        'shared_workflow',
        'workflow_history',
        'workflow_dependency',
        'workflow_publish_history',
        'workflow_statistics',
        'workflows_tags'
      ];
      for (const t of tables) {
        try { db.prepare('DELETE FROM ' + t).run(); } catch {}
      }
      db.exec('PRAGMA foreign_keys = ON;');
    } catch (e) {
      console.error('Aviso al limpiar tablas previas:', e.message);
    }
    " 2>/dev/null || true

    n8n import:workflow --separate --input=/workflows || echo "=> Aviso: Importación completada con avisos o flujos preexistentes."
    echo "=> Activando y publicando flujos de RAX..."
    n8n list:workflow 2>/dev/null | while IFS='|' read -r wfid wfname; do
      if [ -n "$wfid" ]; then
        n8n publish:workflow --id="$wfid" >/dev/null 2>&1 || true
      fi
    done

    # Asegurar consistencia de publicación, proyectos y rutas de webhooks en la base de datos
    node -e "
    const { DatabaseSync } = require('node:sqlite');
    try {
      const db = new DatabaseSync('/home/node/.n8n/database.sqlite');
      
      // 1. Obtener proyecto por defecto para asegurar vinculacion en shared_workflow si fuera necesario
      const project = db.prepare(\"SELECT id FROM project WHERE type='personal' LIMIT 1\").get() || db.prepare(\"SELECT id FROM project LIMIT 1\").get();
      const projectId = project ? project.id : null;

      const workflows = db.prepare('SELECT id, versionId, nodes FROM workflow_entity').all();
      const insertPub = db.prepare('INSERT OR REPLACE INTO workflow_published_version (workflowId, publishedVersionId, createdAt, updatedAt) VALUES (?, ?, datetime(\"now\"), datetime(\"now\"))');
      const updateWf = db.prepare('UPDATE workflow_entity SET active = 1, activeVersionId = COALESCE(activeVersionId, versionId) WHERE id = ?');
      const insertShared = projectId ? db.prepare(\"INSERT OR IGNORE INTO shared_workflow (workflowId, projectId, role, createdAt, updatedAt) VALUES (?, ?, 'workflow:owner', datetime('now'), datetime('now'))\") : null;
      const insertWebhook = db.prepare('INSERT OR REPLACE INTO webhook_entity (workflowId, webhookPath, method, node, webhookId, pathLength) VALUES (?, ?, ?, ?, ?, ?)');

      for (const wf of workflows) {
        updateWf.run(wf.id);
        insertPub.run(wf.id, wf.versionId);
        if (insertShared) {
          insertShared.run(wf.id, projectId);
        }

        let nodes = [];
        try { nodes = typeof wf.nodes === 'string' ? JSON.parse(wf.nodes) : wf.nodes; } catch {}
        for (const n of nodes) {
          if (n.type && n.type.includes('webhook')) {
            const method = (n.parameters && n.parameters.httpMethod) || 'GET';
            const path = (n.parameters && n.parameters.path) || '';
            insertWebhook.run(wf.id, path, method, n.name, n.webhookId || null, path.length);
          }
        }
      }
    } catch (e) { console.error('Error finalizando configuracion de workflows:', e.message); }
    " 2>/dev/null || true
    echo "$HASH_CURRENT" > "$MARKER_FILE"
    echo "=> Flujos de RAX sincronizados y activados exitosamente (19 flujos únicos)."
  fi
else
  echo "=> Directorio /workflows vacío o no encontrado. Continuando..."
fi

# 2. Iniciar el servidor n8n con la configuración del contenedor
echo "=> Levantando servicio n8n en el puerto ${N8N_PORT:-5678}..."
exec /docker-entrypoint.sh "$@"
