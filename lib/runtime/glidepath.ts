import dbClient from '@/lib/database/db_client';

type GlidepathState = {
  missionId: string;
  phase: string;
  progress: number;
  approvalsBlocked: number;
  actionsOpen: number;
  systemReminder: string;
};

async function loadState(missionId: string): Promise<GlidepathState> {
  const approvals = await dbClient.queryOne<any>(
    `SELECT COUNT(*) as count FROM Approvals WHERE mission_id = ? AND status = 'pending'`,
    [missionId],
  );
  const actions = await dbClient.queryOne<any>(
    `SELECT COUNT(*) as count FROM Agent_Actions WHERE mission_id = ? AND status IN ('draft','approved','pending_approval','running')`,
    [missionId],
  );
  return {
    missionId,
    phase: (approvals?.count || 0) > 0 ? 'approval_gate' : 'execution',
    progress: (approvals?.count || 0) > 0 ? 45 : 70,
    approvalsBlocked: approvals?.count || 0,
    actionsOpen: actions?.count || 0,
    systemReminder: 'Route all tool work through Agent_Actions. Do not expose app secrets to computer runtimes.',
  };
}

export async function startGlidepathRun(missionId: string) {
  const { StateGraph, Annotation, START, END } = await import('@langchain/langgraph');
  const State = Annotation.Root({
    missionId: Annotation<string>(),
    phase: Annotation<string>(),
    progress: Annotation<number>(),
    approvalsBlocked: Annotation<number>(),
    actionsOpen: Annotation<number>(),
    systemReminder: Annotation<string>(),
  });

  const graph = new StateGraph(State)
    .addNode('inspect', async (state: GlidepathState) => loadState(state.missionId))
    .addNode('persist', async (state: GlidepathState) => {
      await dbClient.execute(
        `UPDATE Glidepaths SET progress = ?, decisions = ?, blockers = ? WHERE mission_id = ?`,
        [
          state.progress / 100,
          JSON.stringify([{ type: 'runtime_state', phase: state.phase, actionsOpen: state.actionsOpen }]),
          JSON.stringify(state.approvalsBlocked ? [`${state.approvalsBlocked} approval(s) pending`] : []),
          state.missionId,
        ],
      );
      return state;
    })
    .addEdge(START, 'inspect')
    .addEdge('inspect', 'persist')
    .addEdge('persist', END)
    .compile();

  return graph.invoke({
    missionId,
    phase: 'intake',
    progress: 0,
    approvalsBlocked: 0,
    actionsOpen: 0,
    systemReminder: '',
  });
}

export async function resumeGlidepathRun(missionId: string) {
  return startGlidepathRun(missionId);
}

export async function getGlidepathState(missionId: string) {
  return loadState(missionId);
}
