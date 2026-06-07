import type { Migration } from '../migrations';

export const addApprovalTimestamps: Migration = {
  id: '019_approval_timestamps',
  description: 'Add provider-neutral approval creation and update timestamps',
  up(db) {
    for (const statement of [
      `ALTER TABLE Approvals ADD COLUMN created_at TEXT`,
      `ALTER TABLE Approvals ADD COLUMN updated_at TEXT`,
    ]) {
      try { db.exec(statement); } catch (error: any) {
        if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
      }
    }
    db.exec(`UPDATE Approvals
      SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
          updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)`);
  },
};
