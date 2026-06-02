import { writeIdentityProfile, deleteIdentityProfile } from "../../lib/agents";
import { addActivityLog } from "../../lib/db";

const AGENT_START_LOCK_STALE_MS = 30_000;
const startLocksByAgent = new Map<string, { promise: Promise<any>; startedAtMs: number }>();

async function waitForAgentStartLock(agentId: string, lock: { promise: Promise<any>; startedAtMs: number }) {
  const elapsedMs = Date.now() - lock.startedAtMs;
  const remainingMs = AGENT_START_LOCK_STALE_MS - elapsedMs;
  if (remainingMs <= 0) {
    console.warn(`[AgentStartLock] Stale lock for agent ${agentId} continuing queued run start`);
    return;
  }

  let timedOut = false;
  let timeout: any = null;
  await Promise.race([
    lock.promise,
    new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        resolve();
      }, remainingMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);

  if (timedOut) {
    console.warn(`[AgentStartLock] Lock for agent ${agentId} timed out after ${AGENT_START_LOCK_STALE_MS}ms`);
  }
}

export class AgentLifecycleManager {
  /**
   * Acquire a lock for the agent and run the function, preventing concurrent execution for the same agent.
   */
  static async withAgentStartLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
    const previous = startLocksByAgent.get(agentId);
    const waitForPrevious = previous ? waitForAgentStartLock(agentId, previous) : Promise.resolve();

    const run = waitForPrevious.then(fn);
    const marker = run.then(
      () => undefined,
      () => undefined,
    );

    startLocksByAgent.set(agentId, { promise: marker, startedAtMs: Date.now() });

    try {
      return await run;
    } finally {
      if (startLocksByAgent.get(agentId)?.promise === marker) {
        startLocksByAgent.delete(agentId);
      }
    }
  }

  /**
   * Hire/provision hook for a temporary agent, creating their .md identity profile.
   */
  static async hireAgent(
    missionId: string,
    agentId: string,
    name: string,
    role: string,
    permissionTier: string,
    tools: string[],
    systemPrompt: string,
  ): Promise<string> {
    const filePath = writeIdentityProfile({
      name,
      role,
      permissionTier,
      type: "temporary",
      systemPrompt,
      tools,
    });

    await addActivityLog(missionId, {
      eventType: "governance",
      actor: "Supr",
      actorIcon: "smart_toy",
      summary: `Hired subagent "${name}" as ${role}.`,
      detail: `Identity profile compiled. Operational clearance: ${permissionTier}.`,
    });

    return filePath;
  }

  /**
   * Terminate/deprovision hook for a temporary agent, removing their identity profile.
   */
  static async terminateAgent(missionId: string, agentId: string, name: string): Promise<void> {
    deleteIdentityProfile(name);

    await addActivityLog(missionId, {
      eventType: "governance",
      actor: "Supr",
      actorIcon: "smart_toy",
      summary: `Terminated subagent "${name}".`,
      detail: `Identity profile deleted. Agent resource deallocated.`,
    });
  }
}
