import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import { resolveExecutionWorkspacePath } from '@/lib/tools/filesystem';

const MAX_FILES = 1000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /credentials?(?:\.[^.]+)?$/i,
  /service[-_.]?account(?:\.[^.]+)?$/i,
];

interface SnapshotFile {
  path: string;
  bytes: number;
  sha256: string;
  contentBase64: string;
}

interface WorkspaceSnapshot {
  version: 1;
  sessionId: string;
  createdAt: string;
  files: SnapshotFile[];
}

function snapshotObjectName(sessionId: string) {
  return `sessions/${sessionId}/latest.json`;
}

function isSensitiveWorkspaceFile(filePath: string) {
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(path.basename(filePath)));
}

async function collectFiles(root: string, current = root, output: SnapshotFile[] = []): Promise<SnapshotFile[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, absolute, output);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isSensitiveWorkspaceFile(absolute)) continue;
    if (output.length >= MAX_FILES) throw new Error(`Workspace snapshot exceeds ${MAX_FILES} files.`);
    const content = await fs.readFile(absolute);
    if (content.byteLength > MAX_FILE_BYTES) throw new Error(`Workspace snapshot file exceeds ${MAX_FILE_BYTES} bytes.`);
    output.push({
      path: path.relative(root, absolute),
      bytes: content.byteLength,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      contentBase64: content.toString('base64'),
    });
  }
  return output;
}

export async function buildWorkspaceSnapshot(sessionId: string): Promise<WorkspaceSnapshot> {
  const { root } = await resolveExecutionWorkspacePath(sessionId, '.');
  const files = await collectFiles(root);
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total > MAX_SNAPSHOT_BYTES) throw new Error(`Workspace snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes.`);
  return { version: 1, sessionId, createdAt: new Date().toISOString(), files };
}

export async function uploadWorkspaceSnapshot(sessionId: string): Promise<{ uploaded: boolean; objectName?: string }> {
  const bucket = process.env.SUPR_WORKSPACE_SNAPSHOT_BUCKET;
  if (!bucket) return { uploaded: false };
  const snapshot = await buildWorkspaceSnapshot(sessionId);
  const objectName = snapshotObjectName(sessionId);
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
  const client = await auth.getClient();
  await client.request({
    url: `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`,
    method: 'POST',
    params: { uploadType: 'media', name: objectName },
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify(snapshot),
  });
  return { uploaded: true, objectName };
}

export async function restoreWorkspaceSnapshot(sessionId: string): Promise<{ restored: boolean; files: number }> {
  const bucket = process.env.SUPR_WORKSPACE_SNAPSHOT_BUCKET;
  if (!bucket) return { restored: false, files: 0 };
  const objectName = snapshotObjectName(sessionId);
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] });
  const client = await auth.getClient();
  let snapshot: WorkspaceSnapshot;
  try {
    const response = await client.request<WorkspaceSnapshot>({
      url: `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}`,
      method: 'GET',
      params: { alt: 'media' },
    });
    snapshot = response.data;
  } catch (error: any) {
    if (error?.response?.status === 404 || error?.code === 404) return { restored: false, files: 0 };
    throw error;
  }
  if (snapshot?.version !== 1 || snapshot.sessionId !== sessionId || !Array.isArray(snapshot.files)) {
    throw new Error('Workspace snapshot is invalid or belongs to another session.');
  }
  if (snapshot.files.length > MAX_FILES) throw new Error(`Workspace snapshot exceeds ${MAX_FILES} files.`);
  let total = 0;
  const prepared: Array<{ target: string; content: Buffer }> = [];
  const { root } = await resolveExecutionWorkspacePath(sessionId, '.');
  for (const file of snapshot.files) {
    if (isSensitiveWorkspaceFile(file.path)) throw new Error('Workspace snapshot contains a credential-like file.');
    const content = Buffer.from(file.contentBase64, 'base64');
    total += content.byteLength;
    if (content.byteLength !== file.bytes || content.byteLength > MAX_FILE_BYTES || total > MAX_SNAPSHOT_BYTES) {
      throw new Error('Workspace snapshot exceeds configured size limits.');
    }
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (digest !== file.sha256) throw new Error(`Workspace snapshot checksum mismatch: ${file.path}`);
    const { target } = await resolveExecutionWorkspacePath(sessionId, file.path);
    prepared.push({ target, content });
  }
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  for (const { target, content } of prepared) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { flag: 'w' });
  }
  return { restored: true, files: snapshot.files.length };
}
