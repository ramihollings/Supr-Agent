import { operationalMetrics } from '../services/operational-metrics';

export interface TraceEvent {
  timestamp: string;
  agentId: string;
  action: string;
  tool?: string;
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
  metadata?: Record<string, any>;
}

export interface TraceProvider {
  init(): Promise<void>;
  recordEvent(event: TraceEvent): Promise<void>;
  getTraceLog(missionId: string): Promise<TraceEvent[]>;
  flush(): Promise<void>;
}

export class UmamiTraceProvider implements TraceProvider {
  private events: Map<string, TraceEvent[]> = new Map();

  async init(): Promise<void> {
    // Native Supr metrics are DB-backed; in-memory events remain a fast local trace cache.
  }

  async recordEvent(event: TraceEvent): Promise<void> {
    const key = event.metadata?.missionId || '_global';
    if (!this.events.has(key)) {
      this.events.set(key, []);
    }
    this.events.get(key)!.push({ ...event, timestamp: event.timestamp || new Date().toISOString() });

    try {
      await operationalMetrics.record({
        missionId: event.metadata?.missionId,
        agentId: event.agentId,
        eventType: event.tool ? 'tool' : 'agent',
        outcome: event.status,
        durationMs: event.durationMs,
        metadata: {
          action: event.action,
          tool: event.tool,
          trace: event.metadata?.traceId,
        },
      });
    } catch {
      // Tracing should never block execution.
    }
  }

  async getTraceLog(missionId: string): Promise<TraceEvent[]> {
    return this.events.get(missionId) || [];
  }

  async flush(): Promise<void> {
    this.events.clear();
  }
}
