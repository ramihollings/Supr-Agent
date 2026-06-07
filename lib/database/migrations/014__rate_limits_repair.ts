import type { Migration } from '../migrations';

export const addRateLimitsRepair: Migration = {
  id: '014_rate_limits_repair',
  description: 'Ensure the durable rate limit table exists for databases that already applied migration 013',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Rate_Limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },
};
