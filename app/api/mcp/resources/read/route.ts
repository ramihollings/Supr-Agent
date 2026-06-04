import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export const dynamic = 'force-dynamic';

const REPO_ROOT = process.cwd();

/**
 * Read the body of an MCP resource.
 *
 * Supported URI schemes:
 *   - skill://[name]/SKILL.md   — the skill body as a string
 *   - file://./[relative-path]   — a project-relative text file
 *
 * For resources backed by an in-process Supr server (db schemas,
 * memory items, etc.), the client should use the dedicated
 * Supr-native API routes instead of the generic MCP read.
 */
export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const uri = req.nextUrl.searchParams.get('uri');
  if (!uri) {
    return Response.json({ ok: false, error: 'uri query parameter is required.' }, { status: 400 });
  }
  if (uri.startsWith('skill://')) {
    const rest = uri.slice('skill://'.length);
    const [name] = rest.split('/');
    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      return Response.json({ ok: false, error: 'Invalid skill name.' }, { status: 400 });
    }
    const path = join(REPO_ROOT, '.agents', 'skills', name, 'SKILL.md');
    if (!existsSync(path)) {
      return Response.json({ ok: false, error: `Skill '${name}' not found.` }, { status: 404 });
    }
    return Response.json({ ok: true, uri, name, mimeType: 'text/markdown', body: readFileSync(path, 'utf8') });
  }
  if (uri.startsWith('file://./')) {
    const rel = uri.slice('file://./'.length);
    if (rel.includes('..')) {
      return Response.json({ ok: false, error: 'Path traversal not allowed.' }, { status: 400 });
    }
    const path = join(REPO_ROOT, rel);
    if (!existsSync(path)) {
      return Response.json({ ok: false, error: 'File not found.' }, { status: 404 });
    }
    return Response.json({ ok: true, uri, name: basename(path), mimeType: 'text/plain', body: readFileSync(path, 'utf8') });
  }
  return Response.json({ ok: false, error: `Unsupported URI scheme: ${uri}` }, { status: 400 });
}
