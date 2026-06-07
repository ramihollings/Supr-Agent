import { schedulerTick } from '@/lib/runtime/durable-executions';

/**
 * Backward-compatible facade over the durable scheduler. Cloud Scheduler owns
 * recurrence; application processes may only request a single persisted tick.
 */
export class RoutineScheduler {
  static start(): never {
    throw new Error('In-process routine timers are disabled. Invoke the durable scheduler endpoint instead.');
  }

  static stop(): void {
    // Kept as a no-op for callers shutting down older deployments.
  }

  static async checkAndRunJobs(now = new Date()) {
    return schedulerTick(now);
  }
}

export const routineScheduler = new RoutineScheduler();
