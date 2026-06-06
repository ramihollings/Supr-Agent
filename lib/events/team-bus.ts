import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub for sub-agent team lifecycle events.
 *
 * Mirrors the mission bus (`lib/events/bus.ts`). The team
 * coordinator emits `team:progress` after every member finishes
 * (success or failure) and `team:completed` / `team:failed` when
 * the run is fully reduced. Connected SSE clients on Mission
 * Control subscribe and surface the events as a live progress
 * bar.
 *
 * Event shape:
 *   - `team:progress` { teamId, missionId, name, completed, total,
 *     memberId, memberName, status: 'completed' | 'failed' }
 *   - `team:completed` { teamId, missionId, name, status, checksum,
 *     durationMs, memberCount }
 *   - `team:failed`    { teamId, missionId, name, error, durationMs }
 */
type TeamEventReason =
  | 'team_progress'
  | 'team_completed'
  | 'team_failed';

export interface TeamEvent {
  teamId: string;
  missionId: string | null;
  name: string;
  reason: TeamEventReason;
  at: string;
  // Reason-specific payload. Always present.
  payload: Record<string, unknown>;
}

class TeamEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
  emitTeamEvent(event: TeamEvent) {
    this.emit('event', event);
  }
  onTeamEvent(handler: (event: TeamEvent) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

export const teamEventBus = new TeamEventBus();

export function notifyTeamEvent(event: Omit<TeamEvent, 'at'>): void {
  teamEventBus.emitTeamEvent({ ...event, at: new Date().toISOString() });
}
