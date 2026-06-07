import type { Migration } from '../migrations';

export const addMemorySuperseded: Migration = {
  id: '016_memory_superseded',
  description: 'Add the governed memory superseded marker',
  up(db) {
    try {
      db.exec(`ALTER TABLE Memory_Items ADD COLUMN superseded BOOLEAN DEFAULT 0`);
    } catch (error: any) {
      if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
    }
  },
};
