import { getMissionById, updateTaskStatus, addActivityLog } from './db';
import { Mission, Task, Phase } from '@/types';

/**
 * The Supr Orchestrator evaluates the current state of a mission 
 * and decides what needs to happen next.
 */
export async function orchestrateMission(missionId: string, prompt: string): Promise<string> {
  const mission = await getMissionById(missionId);
  if (!mission) return "Mission not found.";

  // 1. Check for Active Phases and Tasks
  const activePhase = mission.phases.find(p => p.status === 'Active');
  const activeTasks = mission.tasks.filter(t => t.status === 'Active');

  // 2. Logic: If no active tasks, identify the next pending task in the active phase
  if (activeTasks.length === 0 && activePhase) {
    const nextTask = mission.tasks.find(t => t.status === 'Pending');
    if (nextTask) {
      await updateTaskStatus(missionId, nextTask.id, 'Active');
      await addActivityLog(missionId, {
        eventType: 'supr_decision',
        actor: 'Supr',
        actorIcon: 'psychology',
        summary: `Activated task "${nextTask.title}" and assigned to ${nextTask.agentName}.`,
        detail: `Phase: ${activePhase.name}. Auto-promoted from Pending to Active.`
      });
      return `[SUPR] Phase: ${activePhase.name}. I have identified the next priority task: "${nextTask.title}". I am assigning this to the ${nextTask.agentName}.`;
    }
  }

  // 3. Logic: Check for Gate_Pending phases (Approval required)
  const gatePhase = mission.phases.find(p => p.status === 'Gate_Pending');
  if (gatePhase) {
    return `[SUPR] We have reached a critical gate: "${gatePhase.name}". All sub-tasks are complete, but I require your approval to advance the Glidepath. Please review the findings in the Project Report.`;
  }

  // 4. Default: Basic response
  return `[SUPR] Mission "${mission.name}" is in progress. Current focus: ${activePhase?.name || 'Initialization'}. Everything is aligned with the Glidepath.`;
}

