import dbClient from '@/lib/database/db_client';
import { LocalNodeSandbox } from '@/lib/providers/local-node-sandbox';

export type ComputerType = 'local' | 'docker' | 'vm' | 'e2b' | 'kubernetes';

export interface ComputerAdapter {
  id: string;
  type: ComputerType;
  execute(command: string, options?: { timeoutMs?: number; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

class UnsupportedComputer implements ComputerAdapter {
  constructor(public id: string, public type: ComputerType) {}

  async execute(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return {
      stdout: '',
      stderr: `${this.type} computer is registered but requires infrastructure configuration before use.`,
      exitCode: 126,
    };
  }
}

export async function listComputers() {
  return dbClient.query<any>(`SELECT * FROM Computers ORDER BY created_at ASC`);
}

export async function getComputerAdapter(id = 'docker'): Promise<ComputerAdapter> {
  const row = await dbClient.queryOne<any>(`SELECT * FROM Computers WHERE id = ?`, [id]);
  const type = (row?.type || id) as ComputerType;
  if (type === 'local' || type === 'docker') {
    const sandbox = new LocalNodeSandbox();
    return {
      id,
      type,
      execute: async (command) => {
        const sessionId = await sandbox.createSession(`runtime-${Date.now()}`);
        try {
          return await sandbox.executeCommand(sessionId, command);
        } finally {
          await sandbox.destroySession(sessionId);
        }
      },
    };
  }
  return new UnsupportedComputer(id, type);
}

export async function recordComputerHealth(id: string, status: string) {
  await dbClient.execute(
    `UPDATE Computers SET status = ?, last_health_check = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, new Date().toISOString(), id]
  );
}
