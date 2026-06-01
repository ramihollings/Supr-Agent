export interface TaskPayload {
  id: string;
  tool: string;
  args: any;
  context: string;
}

export interface RuntimeProvider {
  /**
   * Initialize the runtime environment.
   */
  init(): Promise<void>;

  /**
   * Execute a specific task with the given memory payload and permission constraints.
   */
  executeTask(taskPayload: TaskPayload, memoryPayload: any, permissionsLevel: number): Promise<any>;
}
