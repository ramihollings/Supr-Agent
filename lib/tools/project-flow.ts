import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import dbClient from '../../lib/database/db_client';
import { toolRegistry, type ToolDefinition } from '../../lib/tools/registry';
import { getRuntimeMode } from '../../lib/runtime/runtime-mode';
import { safeFetchText } from '../../lib/net/safe-fetch';
import { redactSensitiveText } from '../../lib/security/redaction';

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeName(value: string) {
  const name = path.basename(value).trim();
  if (!name || name !== value || name.startsWith('.') || name.includes('\0')) {
    throw new Error('Invalid workspace filename.');
  }
  return name;
}

function workspacePath(filename: string) {
  const allowed = new Set(['.md', '.txt', '.json', '.js', '.ts', '.tsx', '.css', '.html', '.py', '.csv']);
  const name = safeName(filename);
  const ext = path.extname(name).toLowerCase();
  if (!allowed.has(ext)) throw new Error(`Unsupported workspace file type: ${ext || 'none'}.`);
  const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'supr_workspaces');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.resolve(dir, name);
  if (!target.startsWith(dir + path.sep)) throw new Error('Workspace file path validation failed.');
  return { name, target };
}

function buildLineDiff(before: string, after: string) {
  if (before === after) return 'No content changes detected.';
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const max = Math.max(beforeLines.length, afterLines.length);
  const diff: string[] = [];
  for (let index = 0; index < max && diff.length < 160; index += 1) {
    const oldLine = beforeLines[index];
    const newLine = afterLines[index];
    if (oldLine === newLine) continue;
    if (oldLine !== undefined) diff.push(`- ${oldLine}`);
    if (newLine !== undefined) diff.push(`+ ${newLine}`);
  }
  if (diff.length >= 160) diff.push('[diff truncated]');
  return diff.join('\n');
}

async function persistArtifact(input: {
  missionId: string;
  agentId?: string | null;
  title: string;
  type?: string;
  content: string;
  diffSummary?: string;
}) {
  const safeContent = redactSensitiveText(input.content);
  const existing = await dbClient.queryOne<any>(`SELECT * FROM Artifacts WHERE mission_id = ? AND title = ?`, [input.missionId, input.title]);
  const artifactId = existing?.id || id('art');
  const latest = await dbClient.queryOne<any>(`SELECT MAX(version) as version FROM Artifact_Versions WHERE mission_id = ? AND title = ?`, [input.missionId, input.title]);

  if (existing) {
    await dbClient.execute(
      `UPDATE Artifacts SET type = ?, content = ?, created_by_agent_id = ?, quality_status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [input.type || 'markdown', safeContent, input.agentId || null, artifactId],
    ).catch(async () => {
      await dbClient.execute(
        `UPDATE Artifacts SET type = ?, content = ?, created_by_agent_id = ?, quality_status = 'draft' WHERE id = ?`,
        [input.type || 'markdown', safeContent, input.agentId || null, artifactId],
      );
    });
  } else {
    await dbClient.execute(
      `INSERT INTO Artifacts (id, mission_id, type, title, content, created_by_agent_id, quality_status, evidence_refs)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [artifactId, input.missionId, input.type || 'markdown', input.title, safeContent, input.agentId || null, JSON.stringify([])],
    );
  }

  await dbClient.execute(
    `INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    [
      id('av'),
      artifactId,
      input.missionId,
      input.title,
      input.type || 'markdown',
      safeContent,
      Number(latest?.version || 0) + 1,
      input.agentId || 'AgentRuntimeRunner',
      input.diffSummary || `${safeContent.length} bytes written`,
    ],
  );

  return artifactId;
}

const ArtifactParams = z.object({
  missionId: z.string(),
  agentId: z.string().optional(),
  title: z.string().default('agent_artifact.md'),
  type: z.string().default('markdown'),
  content: z.string(),
  diffSummary: z.string().optional(),
});

const workspaceWriteArtifactTool: ToolDefinition<z.infer<typeof ArtifactParams>, any> = {
  name: 'workspace_write_artifact',
  description: 'Creates or updates a mission artifact and records a version.',
  parameters: ArtifactParams,
  requiredTier: 'Edit',
  riskLevel: 'Medium',
  execute: async (params) => {
    const artifactId = await persistArtifact(params);
    return {
      artifactId,
      evidence: { artifacts: [artifactId] },
    };
  },
};

const FileParams = z.object({
  missionId: z.string(),
  agentId: z.string().optional(),
  filename: z.string(),
  content: z.string(),
  previousContent: z.string().optional(),
  patchSummary: z.string().optional(),
});

const workspaceWriteFileTool: ToolDefinition<z.infer<typeof FileParams>, any> = {
  name: 'workspace_write_file',
  description: 'Writes a scoped file under supr_workspaces and links it to a durable artifact.',
  parameters: FileParams,
  requiredTier: 'Edit',
  riskLevel: 'Medium',
  execute: async (params) => {
    if (Buffer.byteLength(params.content, 'utf-8') > 512 * 1024) {
      throw new Error('Workspace file content exceeds 512KB limit.');
    }
    const { name, target } = workspacePath(params.filename);
    const previousContent = params.previousContent ?? (fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : '');
    const diff = buildLineDiff(previousContent, params.content);
    fs.writeFileSync(target, params.content, 'utf-8');
    const artifactId = await persistArtifact({
      missionId: params.missionId,
      agentId: params.agentId,
      title: `workspace_file_${name}.md`,
      type: 'markdown',
      content: [
        '# Workspace File Write',
        '',
        `File: ${name}`,
        `Bytes: ${Buffer.byteLength(params.content, 'utf-8')}`,
        `Patch Summary: ${params.patchSummary || 'Runtime file write'}`,
        '',
        '## Diff',
        '```diff',
        diff,
        '```',
        '',
        'The file was written through the governed runtime tool registry.',
      ].join('\n'),
      diffSummary: params.patchSummary || `Workspace file ${name} written`,
    });
    return {
      filename: name,
      bytes: Buffer.byteLength(params.content, 'utf-8'),
      diff,
      evidence: { artifacts: [artifactId], diffs: [name] },
    };
  },
};

const MissionParams = z.object({
  missionId: z.string(),
  agentId: z.string().optional(),
});

const validateOutputsTool: ToolDefinition<z.infer<typeof MissionParams>, any> = {
  name: 'workspace_validate_outputs',
  description: 'Validates artifact presence and open work state for a mission.',
  parameters: MissionParams,
  requiredTier: 'Draft',
  riskLevel: 'Low',
  execute: async (params) => {
    const artifacts = await dbClient.query<any>(`SELECT id, title, type FROM Artifacts WHERE mission_id = ? ORDER BY created_at ASC`, [params.missionId]);
    const open = await dbClient.queryOne<any>(
      `SELECT COUNT(*) as count FROM Agent_Actions WHERE mission_id = ? AND status IN ('draft','running','failed','pending_approval')`,
      [params.missionId],
    );
    const artifactId = await persistArtifact({
      missionId: params.missionId,
      agentId: params.agentId,
      title: 'runtime_validation_report.md',
      type: 'markdown',
      content: [
        '# Runtime Validation Report',
        '',
        `Artifacts: ${artifacts.length}`,
        `Open actions: ${Number(open?.count || 0)}`,
        '',
        ...artifacts.map((artifact) => `- ${artifact.title} (${artifact.type || 'artifact'})`),
      ].join('\n'),
      diffSummary: 'Runtime validation inspected artifacts and open actions',
    });
    return {
      artifactCount: artifacts.length,
      openActions: Number(open?.count || 0),
      evidence: { artifacts: [artifactId] },
    };
  },
};

const governanceReviewTool: ToolDefinition<z.infer<typeof MissionParams>, any> = {
  name: 'governance_review',
  description: 'Reviews approvals and governance state for a mission.',
  parameters: MissionParams,
  requiredTier: 'Edit',
  riskLevel: 'Medium',
  execute: async (params) => {
    const approvals = await dbClient.query<any>(`SELECT id, action, risk_level, status, reason FROM Approvals WHERE mission_id = ? ORDER BY created_at DESC`, [params.missionId]);
    const artifactId = await persistArtifact({
      missionId: params.missionId,
      agentId: params.agentId,
      title: 'runtime_governance_review.md',
      type: 'markdown',
      content: [
        '# Runtime Governance Review',
        '',
        ...approvals.map((approval) => `- ${approval.id}: ${approval.action} (${approval.risk_level}) ${approval.status}`),
        ...(approvals.length === 0 ? ['- No approvals are currently recorded.'] : []),
      ].join('\n'),
      diffSummary: `${approvals.length} approvals reviewed`,
    });
    return { approvals: approvals.length, evidence: { artifacts: [artifactId] } };
  },
};

const deliveryPackageTool: ToolDefinition<z.infer<typeof MissionParams>, any> = {
  name: 'delivery_package',
  description: 'Compiles mission artifacts and runtime status into a delivery package.',
  parameters: MissionParams,
  requiredTier: 'Draft',
  riskLevel: 'Low',
  execute: async (params) => {
    const artifacts = await dbClient.query<any>(`SELECT id, title, type FROM Artifacts WHERE mission_id = ? ORDER BY created_at ASC`, [params.missionId]);
    const artifactId = await persistArtifact({
      missionId: params.missionId,
      agentId: params.agentId,
      title: 'runtime_delivery_package.md',
      type: 'markdown',
      content: [
        '# Runtime Delivery Package',
        '',
        ...artifacts.map((artifact) => `- ${artifact.title} (${artifact.type || 'artifact'})`),
        ...(artifacts.length === 0 ? ['- No artifacts are attached yet.'] : []),
      ].join('\n'),
      diffSummary: `${artifacts.length} artifacts summarized`,
    });
    return { artifacts: artifacts.length, evidence: { artifacts: [artifactId] } };
  },
};

const WebScrapeParams = z.object({
  query: z.string().optional(),
  url: z.string().url().optional(),
});

const webScrapeTool: ToolDefinition<z.infer<typeof WebScrapeParams>, any> = {
  name: 'web_scrape',
  description: 'Fetches source text from a URL or performs a lightweight public source lookup.',
  parameters: WebScrapeParams,
  requiredTier: 'Observe',
  riskLevel: 'Low',
  execute: async (params) => {
    const mode = await getRuntimeMode();
    if (params.url) {
      // Route the user-controlled URL through the shared SSRF
      // defense: protocol check, private-IP block, DNS pinning,
      // redirect re-validation, hard size cap. The previous
      // implementation called fetch(params.url) directly, so an
      // agent could use this tool to hit cloud metadata services
      // (169.254.169.254) or local services (127.0.0.0/8).
      const text = await safeFetchText(params.url, { maxBytes: 12_000, timeoutMs: 10_000 });
      return { url: params.url, content: text.slice(0, 12000), evidence: { sources: [params.url] } };
    }
    if (!params.query) throw new Error('web_scrape requires either url or query.');
    // DuckDuckGo is a fixed external endpoint hardcoded by us, not
    // user-controlled, so it doesn't need the full SSRF defense —
    // but it still benefits from the shared size cap and timeout.
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(params.query)}&format=json&no_redirect=1&no_html=1`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Source search failed: ${response.status}`);
    const data = await response.json();
    const snippets = [data.AbstractText, ...(Array.isArray(data.RelatedTopics) ? data.RelatedTopics.map((item: any) => item.Text).filter(Boolean).slice(0, 6) : [])].filter(Boolean);
    const url = data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(params.query)}`;
    if (snippets.length === 0 && mode === 'real') {
      return { mode: 'no_source_evidence', url, snippets: [], evidence: { sources: [] } };
    }
    return { mode: snippets.length ? 'Live' : 'no_source_evidence', url, snippets, evidence: snippets.length ? { sources: [url] } : { sources: [] } };
  },
};

for (const tool of [
  workspaceWriteArtifactTool,
  workspaceWriteFileTool,
  validateOutputsTool,
  governanceReviewTool,
  deliveryPackageTool,
  webScrapeTool,
]) {
  toolRegistry.registerTool(tool);
}
