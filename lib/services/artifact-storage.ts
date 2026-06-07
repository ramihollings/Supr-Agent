import { GoogleAuth } from 'google-auth-library';
import dbClient from '@/lib/database/db_client';
import { serializeRedacted } from '@/lib/security/redaction';

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

function safeObjectToken(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
}

async function uploadJson(bucket: string, objectName: string, value: unknown) {
  const payload = serializeRedacted(value);
  if (Buffer.byteLength(payload, 'utf8') > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artifact payload exceeds ${MAX_ARTIFACT_BYTES} bytes.`);
  }
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
  const client = await auth.getClient();
  await client.request({
    url: `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`,
    method: 'POST',
    params: { uploadType: 'media', name: objectName },
    headers: { 'Content-Type': 'application/json' },
    data: payload,
  });
}

export async function syncArtifactVersionToGcs(versionId: string): Promise<{ uploaded: boolean; uri?: string }> {
  const bucket = process.env.SUPR_ARTIFACT_BUCKET;
  if (!bucket) return { uploaded: false };
  const version = await dbClient.queryOne<any>('SELECT * FROM Artifact_Versions WHERE id = ?', [versionId]);
  if (!version) throw new Error(`Artifact version not found: ${versionId}`);
  const objectName = [
    'missions',
    safeObjectToken(version.mission_id),
    'artifacts',
    safeObjectToken(version.artifact_id || 'unlinked'),
    `${safeObjectToken(version.id)}.json`,
  ].join('/');
  const uri = `gs://${bucket}/${objectName}`;
  await uploadJson(bucket, objectName, {
    schemaVersion: 1,
    id: version.id,
    artifactId: version.artifact_id,
    missionId: version.mission_id,
    title: version.title,
    type: version.type,
    version: version.version,
    status: version.status,
    generatedBy: version.generated_by,
    diffSummary: version.diff_summary,
    content: version.content,
    createdAt: version.created_at,
  });
  await dbClient.runTransaction([
    { sql: 'UPDATE Artifact_Versions SET storage_uri = ? WHERE id = ?', params: [uri, version.id] },
    { sql: 'UPDATE Artifacts SET storage_uri = ? WHERE id = ?', params: [uri, version.artifact_id] },
  ]);
  return { uploaded: true, uri };
}

export async function syncMissionArtifactsToGcs(missionId: string) {
  const bucket = process.env.SUPR_ARTIFACT_BUCKET;
  if (!bucket) return { uploaded: 0 };
  const versions = await dbClient.query<{ id: string }>(
    'SELECT id FROM Artifact_Versions WHERE mission_id = ? ORDER BY created_at ASC, id ASC',
    [missionId],
  );
  for (const version of versions) await syncArtifactVersionToGcs(version.id);
  return { uploaded: versions.length };
}
