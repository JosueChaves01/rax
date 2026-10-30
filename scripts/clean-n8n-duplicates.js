const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/home/node/.n8n/database.sqlite');

// Desactivar temporalmente foreign keys para poder limpiar los duplicados limpiamente
db.exec('PRAGMA foreign_keys = OFF;');

const rows = db.prepare('SELECT id, name, createdAt FROM workflow_entity ORDER BY name, createdAt ASC').all();
console.log('Workflows antes de limpiar:', rows.length);

const seen = new Set();
const toDelete = [];

for (const row of rows) {
  if (seen.has(row.name)) {
    toDelete.push(row.id);
  } else {
    seen.add(row.name);
  }
}

console.log('Workflows duplicados a eliminar:', toDelete.length);
console.log('Workflows únicos a conservar:', seen.size);

const deleteTablesWithWorkflowId = [
  'workflows_tags',
  'shared_workflow',
  'processed_data',
  'insights_metadata',
  'chat_hub_messages',
  'workflow_dependency',
  'workflow_published_version',
  'chat_hub_sessions',
  'workflow_builder_session',
  'workflow_publish_history',
  'ai_builder_temporary_workflow',
  'evaluation_config',
  'evaluation_collection',
  'test_run',
  'workflow_history',
  'execution_entity',
  'workflow_publication_trigger_status',
  'workflow_review_request_workflow',
  'poller_state',
  'agent_workflow_dependency',
  'workflow_publication_retry_state',
  'migration_finding',
  'migration_workflow_owner',
  'workflow_suggestion',
  'self_healing_result'
];

for (const id of toDelete) {
  for (const table of deleteTablesWithWorkflowId) {
    try {
      db.prepare(`DELETE FROM ${table} WHERE workflowId = ?`).run(id);
    } catch {}
  }
  db.prepare('DELETE FROM workflow_entity WHERE id = ?').run(id);
}

db.exec('PRAGMA foreign_keys = ON;');

const remaining = db.prepare('SELECT id, name FROM workflow_entity ORDER BY name ASC').all();
console.log('\nWorkflows únicos finales tras la limpieza (' + remaining.length + '):');
remaining.forEach((r, idx) => console.log(`${idx + 1}. [${r.id}] ${r.name}`));
