/**
 * Workflow modes and DAG execution logic.
 * Supports: sequential, fan_out, collect, conditional, await_approval, dispatch_channel, write_memory.
 */

export type WorkflowMode =
  | "sequential"
  | "fan_out"
  | "collect"
  | "conditional"
  | "await_approval"
  | "dispatch_channel"
  | "write_memory";

export interface WorkflowStep {
  id: string;
  name: string;
  mode: WorkflowMode;
  agentId?: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  dependsOn?: string[]; // parent step IDs
  config?: Record<string, any>;
}

export interface WorkflowGraph {
  steps: WorkflowStep[];
}

export class WorkflowEngine {
  /**
   * Performs a topological sort to detect cycles and validate the workflow DAG.
   */
  static validateGraph(graph: WorkflowGraph): boolean {
    const adjList: Map<string, string[]> = new Map();
    const inDegree: Map<string, number> = new Map();

    for (const step of graph.steps) {
      adjList.set(step.id, []);
      inDegree.set(step.id, 0);
    }

    for (const step of graph.steps) {
      if (step.dependsOn) {
        for (const parentId of step.dependsOn) {
          if (!adjList.has(parentId)) {
            // Refers to a non-existent step
            return false;
          }
          adjList.get(parentId)!.push(step.id);
          inDegree.set(step.id, inDegree.get(step.id)! + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const u = queue.shift()!;
      visitedCount++;
      for (const v of adjList.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    return visitedCount === graph.steps.length;
  }

  /**
   * Returns a list of steps that are ready to run (i.e. pending, and all parents are completed).
   */
  static getRunnableSteps(graph: WorkflowGraph): WorkflowStep[] {
    const runnable: WorkflowStep[] = [];
    const completedIds = new Set(
      graph.steps.filter((s) => s.status === "completed" || s.status === "skipped").map((s) => s.id),
    );

    for (const step of graph.steps) {
      if (step.status !== "pending") {
        continue;
      }

      const parents = step.dependsOn || [];
      const allParentsCompleted = parents.every((pId) => completedIds.has(pId));

      if (allParentsCompleted) {
        runnable.push(step);
      }
    }

    return runnable;
  }

  /**
   * Handles condition-based step skipping for branching conditional nodes.
   */
  static evaluateConditionalStep(
    step: WorkflowStep,
    contextData: Record<string, any>,
  ): { status: "completed" | "skipped"; nextBranch: string } {
    const condition = step.config?.condition;
    const trueBranch = step.config?.trueBranch;
    const falseBranch = step.config?.falseBranch;

    if (!condition || !trueBranch || !falseBranch) {
      return { status: "completed", nextBranch: trueBranch || "" };
    }

    // Simple evaluate matching context value
    const val = contextData[condition.field];
    const isTrue = val === condition.value;

    return {
      status: "completed",
      nextBranch: isTrue ? trueBranch : falseBranch,
    };
  }
}
