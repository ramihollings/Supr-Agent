import type { Migration } from '../migrations';

export const addSchedulerControls: Migration = {
  id: '015_scheduler_controls',
  description: 'Add explicit scheduler enablement, previous result, and last execution fields',
  up(db) {
    for (const statement of [
      `ALTER TABLE Cron_Jobs ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE Cron_Jobs ADD COLUMN previous_result TEXT`,
      `ALTER TABLE Cron_Jobs ADD COLUMN last_execution_id TEXT`,
    ]) {
      try {
        db.exec(statement);
      } catch (error: any) {
        if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
      }
    }
  },
};
