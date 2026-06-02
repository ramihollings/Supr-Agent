/**
 * Execution Policy structures and gates.
 * Handles task-level workflows and multi-stage human/agent review pipelines.
 */

export type TaskExecutionStatus = "idle" | "in_progress" | "in_review" | "completed" | "changes_requested";

export interface ExecutionStage {
  id: string;
  type: "review" | "approval";
  approverId: string; // agentId or "human-board"
}

export interface ExecutionPolicy {
  stages: ExecutionStage[];
  commentRequired?: boolean;
}

export interface ExecutionState {
  status: TaskExecutionStatus;
  currentStageIndex: number;
  completedStages: string[];
  returnAssignee: string; // The agent who worked on it (e.g. Code Agent)
  reviewComments: Array<{
    stageId: string;
    decision: "approved" | "changes_requested";
    comment: string;
    actor: string;
    timestamp: string;
  }>;
}

export class ExecutionPolicyManager {
  /**
   * Initializes state for a task with a policy.
   */
  static initExecutionState(assigneeId: string): ExecutionState {
    return {
      status: "idle",
      currentStageIndex: 0,
      completedStages: [],
      returnAssignee: assigneeId,
      reviewComments: [],
    };
  }

  /**
   * Transition task status when work is submitted for review.
   */
  static submitForReview(
    state: ExecutionState,
    policy: ExecutionPolicy,
    assigneeId: string,
  ): { nextState: ExecutionState; nextAssignee: string; status: TaskExecutionStatus } {
    if (!policy.stages || policy.stages.length === 0) {
      return {
        nextState: {
          ...state,
          status: "completed",
        },
        nextAssignee: assigneeId,
        status: "completed",
      };
    }

    const firstStage = policy.stages[0]!;
    return {
      nextState: {
        ...state,
        status: "in_review",
        currentStageIndex: 0,
        returnAssignee: assigneeId,
      },
      nextAssignee: firstStage.approverId,
      status: "in_review",
    };
  }

  /**
   * Transition task status when a decision (approve / request changes) is made by a reviewer.
   */
  static makeDecision(
    state: ExecutionState,
    policy: ExecutionPolicy,
    actorId: string,
    decision: "approved" | "changes_requested",
    comment: string,
  ): { nextState: ExecutionState; nextAssignee: string; status: TaskExecutionStatus } {
    if (state.status !== "in_review") {
      throw new Error(`Cannot review task in status: ${state.status}`);
    }

    const currentStage = policy.stages[state.currentStageIndex];
    if (!currentStage) {
      throw new Error(`No active review stage found at index: ${state.currentStageIndex}`);
    }

    // Record review comment
    const updatedComments = [
      ...state.reviewComments,
      {
        stageId: currentStage.id,
        decision,
        comment,
        actor: actorId,
        timestamp: new Date().toISOString(),
      },
    ];

    if (decision === "changes_requested") {
      return {
        nextState: {
          ...state,
          status: "changes_requested",
          reviewComments: updatedComments,
        },
        nextAssignee: state.returnAssignee,
        status: "changes_requested",
      };
    }

    // Decision is approved
    const completedStages = [...state.completedStages, currentStage.id];
    const nextStageIndex = state.currentStageIndex + 1;

    if (nextStageIndex >= policy.stages.length) {
      // All stages approved
      return {
        nextState: {
          ...state,
          status: "completed",
          currentStageIndex: nextStageIndex,
          completedStages,
          reviewComments: updatedComments,
        },
        nextAssignee: state.returnAssignee,
        status: "completed",
      };
    }

    // Go to next stage
    const nextStage = policy.stages[nextStageIndex]!;
    return {
      nextState: {
        ...state,
        currentStageIndex: nextStageIndex,
        completedStages,
        reviewComments: updatedComments,
      },
      nextAssignee: nextStage.approverId,
      status: "in_review",
    };
  }
}
