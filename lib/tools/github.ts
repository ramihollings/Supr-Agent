import { z } from 'zod';
import type { ToolContext } from '@/lib/integrations/contracts';
import { integrationRegistry } from '@/lib/integrations/registry';
import { getSecretSetting } from '@/lib/secrets';
import { toolRegistry, type ToolDefinition } from './registry';

const GitHubName = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/, 'Invalid GitHub owner or repository name.');
const IssueNumber = z.number().int().positive();
const IdempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/, 'Invalid idempotency key.');
const MAX_RESPONSE_BYTES = 1024 * 1024;

export const GitHubRepositoryParams = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('get_repository'), owner: GitHubName, repo: GitHubName }),
  z.object({ operation: z.literal('list_issues'), owner: GitHubName, repo: GitHubName, state: z.enum(['open', 'closed', 'all']).default('open') }),
  z.object({ operation: z.literal('get_issue'), owner: GitHubName, repo: GitHubName, issueNumber: IssueNumber }),
]);

export const GitHubCreateIssueParams = z.object({
  owner: GitHubName,
  repo: GitHubName,
  title: z.string().trim().min(1).max(256),
  body: z.string().max(50_000).optional(),
  labels: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  idempotencyKey: IdempotencyKey,
});

type GitHubRepositoryInput = z.infer<typeof GitHubRepositoryParams>;
type GitHubCreateIssueInput = z.infer<typeof GitHubCreateIssueParams>;
type GitHubInput = GitHubRepositoryInput | ({ operation: 'create_issue' } & GitHubCreateIssueInput);
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const RepositoryResponse = z.object({
  full_name: z.string(),
  html_url: z.string().url(),
  description: z.string().nullable().optional(),
  default_branch: z.string(),
  visibility: z.string().optional(),
});

const IssueResponse = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  html_url: z.string().url(),
  body: z.string().nullable().optional(),
  labels: z.array(z.union([z.string(), z.object({ name: z.string().nullable().optional() })])).default([]),
});

function issueOutput(issue: z.infer<typeof IssueResponse>, reused = false) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    body: issue.body ?? null,
    labels: issue.labels.map((label) => typeof label === 'string' ? label : label.name).filter(Boolean),
    reused,
  };
}

async function readJson(response: Response) {
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new Error('GitHub response exceeds the allowed size.');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('GitHub response exceeds the allowed size.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('GitHub returned an invalid JSON response.');
  }
}

async function githubFetch(path: string, token: string | undefined, signal: AbortSignal | undefined, fetchImpl: FetchLike, init: RequestInit = {}) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    ...init,
    signal,
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = await readJson(response);
  if (!response.ok) {
    const message = z.object({ message: z.string() }).safeParse(data);
    throw new Error(`GitHub API request failed (${response.status}): ${message.success ? message.data.message.slice(0, 500) : 'unexpected response'}`);
  }
  return data;
}

function parseRepository(data: unknown) {
  const parsed = RepositoryResponse.safeParse(data);
  if (!parsed.success) throw new Error('GitHub returned an invalid response for repository details.');
  return {
    fullName: parsed.data.full_name,
    url: parsed.data.html_url,
    description: parsed.data.description ?? null,
    defaultBranch: parsed.data.default_branch,
    visibility: parsed.data.visibility,
  };
}

function parseIssue(data: unknown, reused = false) {
  const parsed = IssueResponse.safeParse(data);
  if (!parsed.success) throw new Error('GitHub returned an invalid response for an issue.');
  return issueOutput(parsed.data, reused);
}

export async function requestGithubApi(
  input: GitHubInput,
  token?: string,
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const owner = encodeURIComponent(input.owner);
  const repo = encodeURIComponent(input.repo);
  const base = `/repos/${owner}/${repo}`;

  if (input.operation === 'get_repository') {
    return parseRepository(await githubFetch(base, token, signal, fetchImpl));
  }
  if (input.operation === 'get_issue') {
    return parseIssue(await githubFetch(`${base}/issues/${input.issueNumber}`, token, signal, fetchImpl));
  }
  if (input.operation === 'list_issues') {
    const data = await githubFetch(`${base}/issues?state=${input.state}&per_page=100`, token, signal, fetchImpl);
    const parsed = z.array(IssueResponse).safeParse(data);
    if (!parsed.success) throw new Error('GitHub returned an invalid response for the issue list.');
    return parsed.data.map((issue) => issueOutput(issue));
  }

  if (!token) throw new Error('GITHUB_TOKEN is required to create a GitHub issue.');
  const marker = `<!-- supr-idempotency:${input.idempotencyKey} -->`;
  const existingData = await githubFetch(`${base}/issues?state=all&per_page=100`, token, signal, fetchImpl);
  const existing = z.array(IssueResponse).safeParse(existingData);
  if (!existing.success) throw new Error('GitHub returned an invalid response for the issue list.');
  const prior = existing.data.find((issue) => issue.body?.includes(marker));
  if (prior) return issueOutput(prior, true);

  const body = input.body ? `${input.body}\n\n${marker}` : marker;
  return parseIssue(await githubFetch(`${base}/issues`, token, signal, fetchImpl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: input.title, body, labels: input.labels }),
  }));
}

async function githubToken() {
  return await getSecretSetting('integrations_github', process.env.GITHUB_TOKEN);
}

export const githubRepositoryTool: ToolDefinition<GitHubRepositoryInput, unknown> = {
  name: 'github_repository',
  description: 'Reads repository metadata and issues from a fixed GitHub API endpoint.',
  parameters: GitHubRepositoryParams,
  requiredTier: 'Observe',
  riskLevel: 'Low',
  execute: async (params, context) => requestGithubApi(params, await githubToken() || undefined, context?.signal),
};

export const githubCreateIssueTool: ToolDefinition<GitHubCreateIssueInput, unknown> = {
  name: 'github_create_issue',
  description: 'Creates one GitHub issue using a required idempotency key, or returns the matching existing issue.',
  parameters: GitHubCreateIssueParams,
  requiredTier: 'External_Act',
  riskLevel: 'Medium',
  execute: async (params, context) => requestGithubApi(
    { operation: 'create_issue', ...params },
    await githubToken() || undefined,
    context?.signal,
  ),
};

toolRegistry.registerTool(githubRepositoryTool);
toolRegistry.registerTool(githubCreateIssueTool);

function adapterFor(tool: ToolDefinition, operations: string[], needsToken: boolean) {
  return {
    async describe() {
      const available = !needsToken || Boolean(await githubToken());
      return {
        id: tool.name,
        operations,
        permissions: [tool.requiredTier],
        riskLevel: tool.riskLevel,
        availability: available ? 'available' as const : 'unavailable' as const,
      };
    },
    async validate(input: unknown) {
      const parsed = tool.parameters.safeParse(input);
      return parsed.success
        ? { valid: true, errors: [] }
        : { valid: false, errors: parsed.error.issues.map((issue) => issue.message) };
    },
    async execute(context: ToolContext, input: unknown) {
      const output = await toolRegistry.executeTool(
        tool.name,
        input,
        context.agentId,
        context.missionId,
        context.agentActionId,
        context.signal,
        context.sessionId,
      );
      return { ok: true, output };
    },
    async healthCheck() {
      const available = !needsToken || Boolean(await githubToken());
      return {
        status: available ? 'available' as const : 'unavailable' as const,
        latencyMs: 0,
        ...(!available ? { message: 'GITHUB_TOKEN is not configured.' } : {}),
      };
    },
  };
}

export function registerGithubAdapters() {
  integrationRegistry.register(
    githubRepositoryTool.name,
    adapterFor(githubRepositoryTool, ['get_repository', 'list_issues', 'get_issue'], false),
    { retryLimit: 1, timeoutMs: 20_000 },
  );
  integrationRegistry.register(
    githubCreateIssueTool.name,
    adapterFor(githubCreateIssueTool, ['create_issue'], true),
    { retryLimit: 0, timeoutMs: 20_000 },
  );
}
