import type { Migration } from '../migrations';

export const addArtifactStorageUri: Migration = {
  id: '018_artifact_storage_uri',
  description: 'Track durable GCS object references for artifacts and versions',
  up(db) {
    for (const statement of [
      `ALTER TABLE Artifacts ADD COLUMN storage_uri TEXT`,
      `ALTER TABLE Artifact_Versions ADD COLUMN storage_uri TEXT`,
    ]) {
      try { db.exec(statement); } catch (error: any) {
        if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
      }
    }
  },
};
