import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub for mission state changes.
 *
 * The /api/mission/stream route used to poll SQLite every 2 seconds and
 * diff a hand-rolled hash. Each connected browser added one more poll
 * per cycle, so a fleet of 50 dashboards was 25 SELECTs/sec on top of
 * the work the runtime was already doing.
 *
 * The bus replaces that with direct notify-on-change. Anything that
 * mutates a mission emits `mission:changed` with the affected id;
 * the stream route subscribes, re-fetches the row, and pushes it to
 * the browser only if anything actually changed (defense in depth --
 * a spurious emit still costs one SELECT, not a missed update).
 *
 * Process-local: this works for single-instance deployments (VPS,
 * the bundled standalone build, dev). For multi-instance Cloud Run
 * deployments the stream would need a Redis pub/sub backplane.
 * That is a known limitation; this bus is the in-process shim that
 * removes the polling tax.
 */
type MissionChangeReason =
  | 'agent_action_created'
  | 'agent_action_completed'
  | 'agent_action_failed'
  | 'flow_started'
  | 'flow_paused'
  | 'flow_resumed'
  | 'flow_completed'
  | 'approval_decision'
  | 'mission_updated'
  | 'mission_artifact'
  | 'intake_routed';

export interface MissionChangeEvent {
  missionId: string | null;
  reason: MissionChangeReason;
  at: string;
}

class MissionEventBus extends EventEmitter {
  constructor() {
    super();
    // One dashboard with N open tabs is common; raise the limit so
    // Node doesn't print a MaxListenersExceededWarning.
    this.setMaxListeners(100);
  }

  emitChange(missionId: string | null, reason: MissionChangeReason) {
    const event: MissionChangeEvent = {
      missionId,
      reason,
      at: new Date().toISOString(),
    };
    this.emit('change', event);
  }

  onChange(handler: (event: MissionChangeEvent) => void): () => void {
    this.on('change', handler);
    return () => this.off('change', handler);
  }
}

export const missionEventBus = new MissionEventBus();

/**
 * Emit a change for a specific mission id. When the caller is
 * operating on a "global" change that could affect any mission
 * (e.g. provider cache invalidation), pass `null` and every
 * subscriber will re-fetch.
 */
export function notifyMissionChanged(missionId: string | null, reason: MissionChangeReason): void {
  missionEventBus.emitChange(missionId, reason);
}
