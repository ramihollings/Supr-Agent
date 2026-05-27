export interface MemoryItem {
  id: string;
  workspace_id?: string;
  mission_id?: string;
  scope: 'user' | 'workspace' | 'mission' | 'agent';
  type: 'episodic' | 'semantic' | 'procedural' | 'governance' | 'operational';
  content: string;
  source: string;
  creator: string;
  timestamp: string;
  confidence: number;
  validation_status: 'approved' | 'unapproved' | 'working_assumption';
  sensitivity_level: number;
  embedding?: number[]; // Vector embedding for vector search
}

export interface HybridSearchParams {
  query: string;
  mission_id?: string;
  scope?: string;
  limit?: number;
  min_confidence?: number;
}

export interface HybridSearchResult {
  item: MemoryItem;
  score: number; // Combined RRF score
}

export abstract class MemoryProvider {
  /**
   * Initializes the memory provider (e.g., connecting to DB, setting up vector indices).
   */
  abstract initialize(): Promise<void>;

  /**
   * Stores a new memory item.
   */
  abstract store(item: Omit<MemoryItem, 'id' | 'timestamp'>): Promise<MemoryItem>;

  /**
   * Updates an existing memory item.
   */
  abstract update(id: string, updates: Partial<MemoryItem>): Promise<MemoryItem>;

  /**
   * Retrieves memory items using Hybrid Search (BM25 Lexical + Vector Embeddings via Reciprocal Rank Fusion).
   */
  abstract hybridSearch(params: HybridSearchParams): Promise<HybridSearchResult[]>;

  /**
   * Retrieves a specific memory item by ID.
   */
  abstract getById(id: string): Promise<MemoryItem | null>;

  /**
   * Retrieves all memories for a specific mission and scope.
   */
  abstract getByMission(missionId: string, scope?: string): Promise<MemoryItem[]>;
}
