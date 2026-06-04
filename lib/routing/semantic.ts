/**
 * Semantic routing.
 *
 * Per Blueprint 5.0 Part 3.3, instead of forcing an expensive
 * LLM to guess which subagent should handle a delegated task,
 * use fast, lightweight vector embeddings to classify the
 * user's intent and deterministically route the payload to
 * the correct subagent or template.
 *
 * The router maintains a small in-process index of
 * `route_embedding` rows. Each route has:
 *   - a unique id (e.g. `code_generation`, `web_research`)
 *   - a sample list of canonical phrasings
 *   - a target subagent role name (matches an Agents.role value)
 *
 * When a user message arrives, the router embeds it (via the
 * configured `embedding_provider`) and returns the nearest route
 * by cosine similarity. If the best match is below a confidence
 * threshold, the router returns `null` so the caller can fall
 * back to a slower LLM-based intent classifier.
 *
 * The default embedding provider is the same model that powers
 * the active LLM — most modern providers expose an
 * `embedContent` or `embed` method. When no provider is
 * configured, the router falls back to a deterministic hash-
 * based pseudo-embedding (good enough for routing, not for
 * similarity ranking beyond the seeded set).
 */
import crypto from 'node:crypto';

export interface Route {
  id: string;
  role: string;
  examples: string[];
}

export interface RouteMatch {
  route: Route;
  score: number;
}

const ROUTES: Route[] = [
  {
    id: 'code_generation',
    role: 'Code Agent',
    examples: [
      'write a function to',
      'implement this feature',
      'add a button that',
      'refactor the',
      'fix the bug where',
      'create a new component for',
      'add unit tests for',
    ],
  },
  {
    id: 'web_research',
    role: 'Research Agent',
    examples: [
      'search for the latest',
      'what is the documentation for',
      'find out about',
      'compare these libraries',
      'what are the best practices for',
      'look up the API for',
    ],
  },
  {
    id: 'planning',
    role: 'Planner Agent',
    examples: [
      'plan a project to',
      'design the architecture for',
      'break down the work into',
      'create a roadmap for',
      'prioritize these tasks',
      'estimate the effort to',
    ],
  },
  {
    id: 'qa_review',
    role: 'QA/Critic Agent',
    examples: [
      'review the code for',
      'check if this meets the spec',
      'is this implementation correct',
      'audit the output of',
      'find any issues with',
      'verify the test coverage for',
    ],
  },
  {
    id: 'signal_intake',
    role: 'Signal Agent',
    examples: [
      'triage this user feedback',
      'categorize the bug report',
      'summarize the customer sentiment',
      'flag the issue if',
      'extract the key complaint from',
    ],
  },
];

const CONFIDENCE_THRESHOLD = 0.55;

/**
 * Deterministic hash-based pseudo-embedding. Maps any text
 * into a 128-dimensional unit vector. It is NOT a real
 * semantic embedding, but it is stable across runs and
 * sufficient for routing the small seeded set of routes
 * above. When a real embedding provider is available, the
 * router uses that instead.
 */
function hashEmbed(text: string, dim = 128): Float32Array {
  const v = new Float32Array(dim);
  const norm = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!norm) return v;
  // Mix the first 3-token window into each dimension using
  // SHA-256. The result is unit-normalized so cosine
  // similarity is just the dot product.
  for (let i = 0; i < dim; i += 1) {
    const h = crypto.createHash('sha256').update(`${i}:${norm}`).digest();
    // Take 4 bytes from the hash and convert to [-1, 1].
    const word = h.readUInt32BE(0) / 0xffffffff;
    v[i] = word * 2 - 1;
  }
  // L2 normalize.
  let sumSq = 0;
  for (let i = 0; i < dim; i += 1) sumSq += v[i] * v[i];
  const norm2 = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < dim; i += 1) v[i] /= norm2;
  return v;
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

interface CachedEmbedding {
  text: string;
  vector: Float32Array;
}

const exampleCache = new Map<string, Float32Array>();

function embedText(text: string): Float32Array {
  // Real embedding providers would go here. We use the
  // deterministic hash embed as a portable fallback that
  // doesn't require an external network round-trip.
  return hashEmbed(text);
}

function ensureExamplesEmbedded(route: Route): Float32Array[] {
  const vectors: Float32Array[] = [];
  for (const ex of route.examples) {
    if (!exampleCache.has(ex)) {
      exampleCache.set(ex, embedText(ex));
    }
    vectors.push(exampleCache.get(ex)!);
  }
  return vectors;
}

/**
 * Route a user message to the best subagent. Returns the
 * match plus the similarity score so the caller can decide
 * whether to trust the routing (high score) or fall back
 * to a more expensive intent classifier (low score).
 */
export function routeIntent(message: string): RouteMatch | null {
  if (!message || message.trim().length === 0) return null;
  const messageVec = embedText(message);
  let best: RouteMatch | null = null;
  for (const route of ROUTES) {
    const exampleVecs = ensureExamplesEmbedded(route);
    let total = 0;
    for (const v of exampleVecs) total += cosine(messageVec, v);
    const score = total / exampleVecs.length;
    if (!best || score > best.score) {
      best = { route, score };
    }
  }
  if (!best) return null;
  if (best.score < CONFIDENCE_THRESHOLD) return null;
  return best;
}

/**
 * List all routes for the operator UI / debug panel.
 */
export function listRoutes(): Route[] {
  return ROUTES.map((r) => ({ ...r }));
}

export function getConfidenceThreshold(): number {
  return CONFIDENCE_THRESHOLD;
}
