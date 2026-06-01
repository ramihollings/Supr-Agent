import * as fs from 'fs';
import * as path from 'path';

export interface MemoryChunk {
  id: string;
  type: 'fact' | 'decision' | 'constraint' | 'artifact_ref';
  content: string;
  source: string;
  createdAt: string;
  expiresAt?: string;
}

export interface MemoryPayload {
  chunks: MemoryChunk[];
  tokenEstimate: number;
}

export interface MemoryProvider {
  init(): Promise<void>;
  store(tier: 'user' | 'workspace' | 'mission', chunk: MemoryChunk): Promise<void>;
  retrieve(tier: 'user' | 'workspace' | 'mission', query?: string): Promise<MemoryChunk[]>;
  buildPayload(agentId: string, taskContext: string): Promise<MemoryPayload>;
  purgeMission(missionId: string): Promise<void>;
}

/**
 * LocalMemoryProvider — implements the 3-Tier Memory architecture
 * described in supr.md. Reads scope rules from agent-config/memory_scopes.json.
 * Currently backed by in-memory maps; designed to be swapped for
 * pgvector / Qdrant / Firestore via the same interface.
 */
export class LocalMemoryProvider implements MemoryProvider {
  private store_data: Record<string, MemoryChunk[]> = {
    user: [],
    workspace: [],
    mission: [],
  };
  private scopeConfig: any = {};
  private maxPayloadTokens: number = 8000;

  async init(): Promise<void> {
    try {
      const configPath = path.resolve(process.cwd(), 'agent-config', 'memory_scopes.json');
      const raw = fs.readFileSync(configPath, 'utf8');
      this.scopeConfig = JSON.parse(raw);
      this.maxPayloadTokens = this.scopeConfig.subagentInjection?.payloadMaxTokens || 8000;
    } catch (e) {
      console.warn('[MemoryProvider] Could not load memory_scopes.json. Using defaults.');
    }
  }

  async store(tier: 'user' | 'workspace' | 'mission', chunk: MemoryChunk): Promise<void> {
    if (!this.store_data[tier]) {
      this.store_data[tier] = [];
    }
    this.store_data[tier].push({ ...chunk, createdAt: chunk.createdAt || new Date().toISOString() });
  }

  async retrieve(tier: 'user' | 'workspace' | 'mission', query?: string): Promise<MemoryChunk[]> {
    const chunks = this.store_data[tier] || [];
    if (!query) return chunks;
    // Basic keyword match — a real implementation would use vector similarity
    const q = query.toLowerCase();
    return chunks.filter(c => c.content.toLowerCase().includes(q));
  }

  /**
   * Builds a scoped Memory Payload for a subagent. This is the core of the
   * "Dynamic Subagent Memory" described in supr.md — Supr extracts the exact
   * required context and injects it, rather than giving agents direct access.
   */
  async buildPayload(agentId: string, taskContext: string): Promise<MemoryPayload> {
    const allowedTypes = this.scopeConfig.subagentInjection?.allowedChunkTypes || ['fact', 'decision', 'constraint', 'artifact_ref'];

    // Gather relevant chunks from mission memory (primary) and workspace (supplemental)
    const missionChunks = (this.store_data.mission || []).filter(c => allowedTypes.includes(c.type));
    const workspaceChunks = (this.store_data.workspace || []).filter(c => allowedTypes.includes(c.type));

    const allCandidates = [...missionChunks, ...workspaceChunks];

    // Rough token estimation (4 chars per token)
    let tokenCount = 0;
    const selected: MemoryChunk[] = [];
    for (const chunk of allCandidates) {
      const estimate = Math.ceil(chunk.content.length / 4);
      if (tokenCount + estimate > this.maxPayloadTokens) break;
      selected.push(chunk);
      tokenCount += estimate;
    }

    return { chunks: selected, tokenEstimate: tokenCount };
  }

  /**
   * Purges mission memory after Mission Packet export, as required by supr.md
   * "Treat Mission Memory as a short-term cache."
   */
  async purgeMission(missionId: string): Promise<void> {
    this.store_data.mission = [];
    console.log(`[MemoryProvider] Mission memory purged for: ${missionId}`);
  }
}
