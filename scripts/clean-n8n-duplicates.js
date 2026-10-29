const sqlite3 = require('/usr/local/lib/node_modules/n8n/node_modules/sqlite3');
const db = new sqlite3.Database('/home/node/.n8n/database.sqlite');

db.serialize(() => {
  // Find old workflows
  db.all("SELECT id, name, createdAt FROM workflow_entity WHERE createdAt LIKE '2026-10-29 21:42%'", (err, oldWorkflows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`Found ${oldWorkflows.length} old workflows to remove.`);
    const oldIds = oldWorkflows.map(w => w.id);
    
    if (oldIds.length === 0) {
      console.log('No old workflows found.');
      return;
    }

    const placeholders = oldIds.map(() => '?').join(',');

    // Delete from shared_workflow if exists
    db.run(`DELETE FROM shared_workflow WHERE workflowId IN (${placeholders})`, oldIds, function(e1) {
      if (e1) console.log('shared_workflow note:', e1.message);
      else console.log(`Deleted ${this.changes} from shared_workflow`);

      // Delete from workflow_tag if exists
      db.run(`DELETE FROM workflow_tag WHERE workflowId IN (${placeholders})`, oldIds, function(e2) {
        if (e2) console.log('workflow_tag note:', e2.message);
        else console.log(`Deleted ${this.changes} from workflow_tag`);

        // Delete from workflow_history if exists
        db.run(`DELETE FROM workflow_history WHERE workflowId IN (${placeholders})`, oldIds, function(e3) {
          if (e3) console.log('workflow_history note:', e3.message);
          else console.log(`Deleted ${this.changes} from workflow_history`);

          // Delete from workflow_entity
          db.run(`DELETE FROM workflow_entity WHERE id IN (${placeholders})`, oldIds, function(e4) {
            if (e4) console.error('Error deleting from workflow_entity:', e4);
            else console.log(`Successfully deleted ${this.changes} old workflows from workflow_entity.`);

            // Verify remaining
            db.all("SELECT id, name, createdAt FROM workflow_entity ORDER BY name", (e5, remaining) => {
              if (e5) console.error(e5);
              else {
                console.log(`Remaining active workflows in n8n: ${remaining.length}`);
                remaining.forEach(r => console.log(`- [${r.id}] ${r.name}`));
              }
            });
          });
        });
      });
    });
  });
});
