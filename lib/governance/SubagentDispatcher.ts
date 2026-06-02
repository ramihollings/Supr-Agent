export interface SubagentTask {
  agentId: string;
  taskId: string;
  targetFiles: string[];
  execute: () => Promise<any>;
}

export class SubagentDispatcher {
  /**
   * Detects if there is any file write overlap among a list of tasks.
   * Overlap exists if two different tasks modify the same file path.
   */
  static detectOverlaps(tasks: SubagentTask[]): string[] {
    const fileToTaskMap = new Map<string, string>();
    const overlappingFiles = new Set<string>();

    for (const task of tasks) {
      for (const file of task.targetFiles) {
        const normalized = file.trim().toLowerCase().replace(/\\/g, "/");
        if (fileToTaskMap.has(normalized)) {
          overlappingFiles.add(file);
        } else {
          fileToTaskMap.set(normalized, task.taskId);
        }
      }
    }

    return Array.from(overlappingFiles);
  }

  /**
   * Dispatches subagent tasks.
   * If an overlap is detected, it downgrades execution to sequential to prevent conflicts.
   * Otherwise, runs them in parallel.
   */
  static async dispatch(tasks: SubagentTask[]): Promise<any[]> {
    if (tasks.length === 0) return [];

    const overlaps = this.detectOverlaps(tasks);

    if (overlaps.length > 0) {
      console.warn(
        `[SubagentDispatcher] Overlapping target files detected: [${overlaps.join(", ")}]. Downgrading parallel dispatch to serial execution to prevent conflicts.`,
      );

      const results: any[] = [];
      for (const task of tasks) {
        results.push(await task.execute());
      }
      return results;
    }

    // Run in parallel
    return Promise.all(tasks.map((t) => t.execute()));
  }
}
