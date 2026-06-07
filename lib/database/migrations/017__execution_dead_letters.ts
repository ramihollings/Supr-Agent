import type { Migration } from '../migrations';

export const addExecutionDeadLetters: Migration = {
  id: '017_execution_dead_letters',
  description: 'Add durable dead-letter metadata to job executions',
  up(db) {
    for (const statement of [
      `ALTER TABLE Job_Executions ADD COLUMN dead_lettered_at TEXT`,
      `ALTER TABLE Job_Executions ADD COLUMN dead_letter_reason TEXT`,
    ]) {
      try { db.exec(statement); } catch (error: any) {
        if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
      }
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_job_executions_dead_letter
        ON Job_Executions(dead_lettered_at);
    `);
  },
};
