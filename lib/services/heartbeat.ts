import dbClient from '@/lib/database/db_client';
import { createExecution, enqueueCloudTask } from '@/lib/runtime/durable-executions';

/**
 * Compatibility entry point for older callers that requested a mission
 * heartbeat. Recurrence belongs to Cloud Scheduler; this class only performs
 * one durable, idempotent dispatch pass.
 */
export class HeartbeatService {
  static startInterval(): never {
    throw new Error('In-process heartbeat timers are disabled. Invoke the durable scheduler endpoint instead.');
  }

  static stopInterval(): void {
    // Kept as a no-op for callers shutting down older deployments.
  }

  static async trigger(now = new Date()): Promise<void> {
    const missions = await dbClient.query<{ id: string }>("SELECT id FROM Missions WHERE status = 'Active'");
    const minuteBucket = now.toISOString().slice(0, 16);

    for (const mission of missions) {
      const execution = await createExecution({
        missionId: mission.id,
        source: 'schedule',
        scheduledFor: now.toISOString(),
        idempotencyKey: `heartbeat:${mission.id}:${minuteBucket}`,
      });
      await enqueueCloudTask(execution);
    }
  }
}
