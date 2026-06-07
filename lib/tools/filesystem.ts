import path from 'path';
import { promises as fs } from 'fs';
import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from './registry';

const SESSION_ID = /^[a-zA-Z0-9._-]{1,128}$/;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const FilesystemParams = z.object({
  sessionId: z.string().optional(),
  operation: z.enum(['list', 'read', 'write', 'mkdir', 'delete']),
  path: z.string().default('.'),
  content: z.string().optional(),
});

function isContained(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function resolveExecutionWorkspacePath(sessionId: string, requestedPath: string) {
  if (!SESSION_ID.test(sessionId)) throw new Error('Invalid execution workspace id.');
  if (path.isAbsolute(requestedPath)) throw new Error('Absolute workspace paths are not allowed.');

  const base = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'supr_workspaces');
  const root = path.resolve(base, sessionId);
  const target = path.resolve(root, requestedPath);
  if (!isContained(base, root) || !isContained(root, target)) {
    throw new Error('Workspace path traversal is not allowed.');
  }

  await fs.mkdir(root, { recursive: true });
  let cursor = target;
  while (cursor !== root) {
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error('Workspace symlinks are not allowed.');
      cursor = path.dirname(cursor);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      cursor = path.dirname(cursor);
    }
  }
  const realRoot = await fs.realpath(root);
  if (!isContained(base, realRoot)) throw new Error('Execution workspace escapes the workspace root.');
  return { root, target };
}

async function executeFilesystem(params: z.infer<typeof FilesystemParams>, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error(String(signal.reason || 'Filesystem operation cancelled.'));
  if (!params.sessionId) throw new Error('Execution session id is required for workspace access.');
  const { root, target } = await resolveExecutionWorkspacePath(params.sessionId, params.path);

  switch (params.operation) {
    case 'list': {
      const entries = await fs.readdir(target, { withFileTypes: true });
      return entries.slice(0, 1000).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      }));
    }
    case 'read': {
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error('Only regular files can be read.');
      if (stat.size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} byte read limit.`);
      return { path: path.relative(root, target), content: await fs.readFile(target, 'utf8'), bytes: stat.size };
    }
    case 'write': {
      const content = params.content ?? '';
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_FILE_BYTES) throw new Error(`Content exceeds ${MAX_FILE_BYTES} byte write limit.`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, { encoding: 'utf8', flag: 'w' });
      return { path: path.relative(root, target), bytes };
    }
    case 'mkdir':
      await fs.mkdir(target, { recursive: true });
      return { path: path.relative(root, target), created: true };
    case 'delete':
      if (target === root) throw new Error('Execution workspace root cannot be deleted.');
      await fs.rm(target, { recursive: false, force: false });
      return { path: path.relative(root, target), deleted: true };
  }
}

export const filesystemTool: ToolDefinition<z.infer<typeof FilesystemParams>, unknown> = {
  name: 'workspace_filesystem',
  description: 'Lists, reads, writes, creates, or deletes files inside one isolated execution workspace.',
  parameters: FilesystemParams,
  requiredTier: 'Edit',
  riskLevel: 'Medium',
  execute: async (params, context) => executeFilesystem(
    { ...params, sessionId: context?.sessionId || params.sessionId },
    context?.signal,
  ),
};

toolRegistry.registerTool(filesystemTool);
