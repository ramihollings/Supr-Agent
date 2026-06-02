"use client";

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '@/components/TopNav';
import { MissionWizard } from '@/components/MissionWizard';
import { SetupWizard } from '@/components/SetupWizard';
import { ProjectWorkflowCanvas } from '@/components/ProjectWorkflowCanvas';
import { DashboardObjectDrawer } from '@/components/DashboardObjectDrawer';
import { OperationsPanel } from '@/components/OperationsPanel';
import { ObjectsRail } from '@/components/ObjectsRail';
import { WorkPanel } from '@/components/WorkPanel';
import { useToast } from '@/components/ToastProvider';
import {
  agentToDashboardObject,
  fileToDashboardObject,
  missionToDashboardObject,
  timelineToRunEvents,
} from '@/lib/dashboard-model';
import {
  approveLowRiskActionsAction,
  decideApprovalAction,
  deleteMissionAction,
  exportMissionBundleAction,
  fetchAgentStatuses,
  fetchApprovalCenterAction,
  fetchArtifactVersionsAction,
  fetchConnectorHealthAction,
  fetchMemoryItemsAction,
  fetchMissionByIdAction,
  fetchMissionTimelineAction,
  fetchMissionsAction,
  fetchProjectOperatingGraphAction,
  fetchSettingsAction,
  fetchRunbooksAction,
  fetchSupervisorConsoleAction,
  fetchWorkspaceFilesAction,
  readWorkspaceFileAction,
  pauseProjectFlowAction,
  resumeProjectFlowAction,
  retryFailedFlowNodesAction,
  runProjectFlowAction,
  spawnProjectAgentAction,
  startProjectFlowAction,
  startRunbookAction,
  updateMissionAction,
  duplicateMissionAction,
  archiveAgentAction,
  deleteAgentAction,
} from '@/app/actions';
import { Mission } from '@/types';
import type { DashboardObject, ObjectAction } from '@/types';

type AgentStatus = {
  id: string;
  name: string;
  role: string;
  permissionTier: string;
  status: string;
  currentProject: string | null;
};

type WorkspaceFile = {
  filename: string;
  size: number;
  updatedAt: string;
  type: string;
};

type MobilePanel = 'objects' | 'work' | 'ops';

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get('id');

  const [showWizard, setShowWizard] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [projects, setProjects] = useState<Mission[]>([]);
  const [selectedProject, setSelectedProject] = useState<Mission | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [runbooks, setRunbooks] = useState<any[]>([]);
  const [memoryPreview, setMemoryPreview] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [artifactVersions, setArtifactVersions] = useState<any[]>([]);
  const [operatingGraph, setOperatingGraph] = useState<any | null>(null);
  const [supervisorConsole, setSupervisorConsole] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFlowBusy, setIsFlowBusy] = useState(false);
  const [isSpawningAgent, setIsSpawningAgent] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState({ name: '', objective: '', status: 'Active' as Mission['status'] });
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('work');
  const [selectedObject, setSelectedObject] = useState<DashboardObject | null>(null);
  const { showToast } = useToast();

  const selectedOrFirstProjectId = selectedProjectId || projects[0]?.id || null;
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  const activeAgents = agents.filter((agent) => agent.status !== 'Archived');
  const projectArtifacts = selectedProject?.artifacts || [];
  const supervisorGroups = supervisorConsole?.groups || [];
  const blueprintCount = supervisorConsole?.blueprints?.length || 0;
  const runEvents = useMemo(() => timelineToRunEvents(timeline), [timeline]);
  const dashboardObjects = useMemo(
    () => [
      ...projects.map((project) => missionToDashboardObject(project)),
      ...activeAgents.map((agent) => agentToDashboardObject({
        ...agent,
        icon: 'smart_toy',
        isActive: agent.status !== 'Archived',
        isPermanent: agent.name === 'Supr',
        description: agent.role,
      })),
      ...workspaceFiles.map((file) => fileToDashboardObject(file)),
    ],
    [activeAgents, projects, workspaceFiles],
  );

  const projectStats = useMemo(() => {
    const totalTasks = selectedProject?.tasks?.length || 0;
    const doneTasks = selectedProject?.tasks?.filter((task) => task.status === 'Done').length || 0;
    return {
      totalTasks,
      doneTasks,
      openActions: operatingGraph?.counts?.actions || 0,
      files: workspaceFiles.length,
    };
  }, [operatingGraph, selectedProject, workspaceFiles.length]);

  const loadBaseData = async () => {
    setLoading(true);
    try {
      const [projectRows, agentRows, fileRows, connectorRows, runbookRows, memoryRows, approvalRows, settings] = await Promise.all([
        fetchMissionsAction(),
        fetchAgentStatuses(),
        fetchWorkspaceFilesAction(),
        fetchConnectorHealthAction(),
        fetchRunbooksAction(),
        fetchMemoryItemsAction(),
        fetchApprovalCenterAction(),
        fetchSettingsAction(),
      ]);
      setProjects(projectRows);
      setAgents(agentRows);
      setWorkspaceFiles(fileRows);
      setConnectors(connectorRows);
      setRunbooks(runbookRows);
      setMemoryPreview(memoryRows.slice(0, 5));
      setApprovals(approvalRows);
      const bootstrapPending = settings.has_completed_wizard !== 'true' || settings.global_minimax_key_configured !== 'true';
      setBootstrapRequired(bootstrapPending);
      setShowSetupWizard(bootstrapPending);
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedProject = async (projectId: string | null) => {
    if (!projectId) {
      setSelectedProject(null);
      setTimeline([]);
      setArtifactVersions([]);
      setOperatingGraph(null);
      setSupervisorConsole(null);
      return;
    }

    const [mission, timelineRows, approvalRows, versionRows, graph, supervisor] = await Promise.all([
      fetchMissionByIdAction(projectId),
      fetchMissionTimelineAction(projectId),
      fetchApprovalCenterAction(projectId),
      fetchArtifactVersionsAction(projectId),
      fetchProjectOperatingGraphAction(projectId),
      fetchSupervisorConsoleAction(projectId),
    ]);
    setSelectedProject(mission || null);
    setProjectDraft({
      name: mission?.name || '',
      objective: mission?.objective || '',
      status: mission?.status || 'Active',
    });
    setTimeline(timelineRows);
    setApprovals(approvalRows);
    setArtifactVersions(versionRows);
    setOperatingGraph(graph);
    setSupervisorConsole(supervisor);
  };

  const refreshAll = async () => {
    await loadBaseData();
    await loadSelectedProject(selectedOrFirstProjectId);
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    loadSelectedProject(selectedOrFirstProjectId);
  }, [selectedOrFirstProjectId]);

  const handleProjectSelect = (projectId: string) => {
    router.push(projectId ? `/?id=${projectId}` : '/');
  };

  const handleWizardClose = async () => {
    setShowWizard(false);
    await loadBaseData();
  };

  const handleSetupWizardClose = async () => {
    setShowSetupWizard(false);
    await refreshAll();
  };

  const handleStartRunbook = async (runbookId: string) => {
    const res = await startRunbookAction(runbookId);
    if (res.success && res.missionId) {
      showToast('Runbook project started');
      await loadBaseData();
      router.push(`/?id=${res.missionId}`);
    } else {
      showToast(res.error || 'Runbook could not start');
    }
  };

  const handleSaveProject = async () => {
    if (!selectedProject) return;
    const res = await updateMissionAction(selectedProject.id, projectDraft);
    if (res.success) {
      showToast('Project updated');
      setEditingProject(false);
      await refreshAll();
    } else {
      showToast(res.error || 'Project update failed');
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!confirm(`Delete ${selectedProject.name} and its project runtime records?`)) return;
    const res = await deleteMissionAction(selectedProject.id);
    if (res.success) {
      showToast('Project deleted');
      setSelectedProject(null);
      await loadBaseData();
      router.push('/');
    } else {
      showToast(res.error || 'Project delete failed');
    }
  };

  const handleExportProject = async () => {
    if (!selectedProject) return;
    const res = await exportMissionBundleAction(selectedProject.id);
    if (res.success) {
      downloadJson(`${selectedProject.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}-supr-bundle.json`, res.bundle);
      showToast('Project bundle downloaded');
    } else {
      showToast(res.error || 'Project export failed');
    }
  };

  const handleObjectAction = async (action: ObjectAction, object: DashboardObject) => {
    if (!action.enabled) {
      showToast(action.reason || 'Action is not available');
      return;
    }

    if (object.type === 'project') {
      if (action.id === 'open') handleProjectSelect(object.id);
      if (action.id === 'edit' && selectedProject?.id === object.id) setEditingProject(true);
      if (action.id === 'download' || action.id === 'export') await handleExportProject();
      if (action.id === 'delete' && selectedProject?.id === object.id) await handleDeleteProject();
      if (action.id === 'duplicate') {
        showToast(`Duplicating project: ${object.title}...`);
        const res = await duplicateMissionAction(object.id);
        if (res.success && res.missionId) {
          showToast(`Project duplicated successfully`);
          await loadBaseData();
          router.push(`/?id=${res.missionId}`);
        } else {
          showToast(res.error || 'Project duplication failed');
        }
      }
      return;
    }

    if (object.type === 'file') {
      if (action.id === 'open' || action.id === 'edit') router.push('/library');
      if (action.id === 'download') {
        const content = await readWorkspaceFileAction(object.id);
        downloadJson(`${object.id}.manifest.json`, { object, content });
        showToast(`${object.title} manifest downloaded`);
      }
      return;
    }

    if (object.type === 'sub-agent') {
      if (action.id === 'open' || action.id === 'edit') {
        router.push('/agents');
      } else if (action.id === 'retry') {
        showToast(`Runtime recycle requested for ${object.title}`);
      } else if (action.id === 'archive') {
        if (confirm(`Archive sub-agent ${object.title}?`)) {
          await archiveAgentAction(object.id);
          showToast(`Sub-agent ${object.title} archived`);
          await refreshAll();
        }
      } else if (action.id === 'delete') {
        if (confirm(`Permanently delete sub-agent ${object.title} and their identity profile?`)) {
          await deleteAgentAction(object.id, object.title);
          showToast(`Sub-agent ${object.title} deleted`);
          await refreshAll();
        }
      }
      return;
    }

    showToast(`${action.label} queued for ${object.title}`);
  };

  const handleApprovalDecision = async (id: string, decision: 'approved' | 'rejected' | 'revised') => {
    const res = await decideApprovalAction(id, decision);
    showToast(res.success ? `Approval ${decision}` : 'Approval update failed');
    await loadSelectedProject(selectedOrFirstProjectId);
  };

  const handleFlowControl = async (
    action: 'start' | 'run' | 'pause' | 'resume' | 'retry' | 'approveLowRisk',
  ) => {
    if (!selectedOrFirstProjectId) return;
    setIsFlowBusy(true);
    const handlers = {
      start: startProjectFlowAction,
      run: runProjectFlowAction,
      pause: pauseProjectFlowAction,
      resume: resumeProjectFlowAction,
      retry: retryFailedFlowNodesAction,
      approveLowRisk: approveLowRiskActionsAction,
    };
    const res: any = await handlers[action](selectedOrFirstProjectId);
    showToast(res.success ? `Project flow ${action} complete` : res.error || `Project flow ${action} failed`);
    await loadSelectedProject(selectedOrFirstProjectId);
    setIsFlowBusy(false);
  };

  const handleSpawnProjectAgent = async (draft: {
    role: string;
    objective: string;
    permissionTier: string;
    capability: string;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  }) => {
    if (!selectedOrFirstProjectId) return;
    setIsSpawningAgent(true);
    const res = await spawnProjectAgentAction({
      missionId: selectedOrFirstProjectId,
      ...draft,
    });
    showToast(res.success ? 'Agent spawned into project flow' : res.error || 'Agent spawn failed');
    await refreshAll();
    setIsSpawningAgent(false);
  };

  return (
    <div className="flex-1 md:ml-64 min-h-screen bg-surface-container text-on-surface overflow-hidden">
      {showSetupWizard && <SetupWizard onClose={handleSetupWizardClose} required={bootstrapRequired} />}
      {showWizard && <MissionWizard onClose={handleWizardClose} />}
      <DashboardObjectDrawer
        object={selectedObject}
        timeline={runEvents}
        onClose={() => setSelectedObject(null)}
        onAction={handleObjectAction}
      />
      <TopNav title="Supr Command Deck" />

      <div className="xl:hidden bg-background border-b-4 border-primary grid grid-cols-3">
        {[
          { id: 'objects', label: 'Objects', icon: 'inventory_2' },
          { id: 'work', label: 'Work', icon: 'hub' },
          { id: 'ops', label: 'Ops', icon: 'tune' },
        ].map((panel) => (
          <button
            key={panel.id}
            onClick={() => setMobilePanel(panel.id as MobilePanel)}
            className={`py-3 px-2 border-r-2 last:border-r-0 border-primary font-headline font-black uppercase text-[10px] flex items-center justify-center gap-1.5 ${
              mobilePanel === panel.id ? 'bg-primary text-on-primary' : 'bg-background text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{panel.icon}</span>
            {panel.label}
          </button>
        ))}
      </div>

      <div className="h-[calc(100vh-64px)] xl:h-[calc(100vh-4rem)] flex flex-col xl:flex-row overflow-hidden">
        <ObjectsRail
          mobilePanel={mobilePanel}
          loading={loading}
          projects={projects}
          activeAgents={activeAgents}
          workspaceFiles={workspaceFiles}
          dashboardObjects={dashboardObjects}
          selectedProjectId={selectedOrFirstProjectId}
          onSelectProject={handleProjectSelect}
          onCreateProject={() => setShowWizard(true)}
          onRefresh={refreshAll}
          onInspectObject={setSelectedObject}
        />

        <WorkPanel
          mobilePanel={mobilePanel}
          selectedProject={selectedProject}
          editingProject={editingProject}
          projectDraft={projectDraft}
          projectStats={projectStats}
          pendingApprovalsCount={pendingApprovals.length}
          operatingGraph={operatingGraph}
          runEvents={runEvents}
          timeline={timeline}
          artifactVersions={artifactVersions}
          projectArtifacts={projectArtifacts}
          memoryPreview={memoryPreview}
          isFlowBusy={isFlowBusy}
          isSpawningAgent={isSpawningAgent}
          onStartEdit={() => setEditingProject(true)}
          onCancelEdit={() => setEditingProject(false)}
          onSaveEdit={handleSaveProject}
          onChangeDraft={setProjectDraft}
          onExport={handleExportProject}
          onDelete={handleDeleteProject}
          onCreateProject={() => setShowWizard(true)}
          onSpawnAgent={handleSpawnProjectAgent}
          onFlowControl={handleFlowControl}
        />

        <OperationsPanel
          mobilePanel={mobilePanel}
          agents={agents}
          approvals={approvals}
          connectors={connectors}
          runbooks={runbooks}
          metrics={supervisorConsole?.metrics || []}
          supervisorGroups={supervisorGroups}
          blueprintCount={blueprintCount}
          selectedProjectId={selectedOrFirstProjectId}
          onApprovalDecision={handleApprovalDecision}
          onStartRunbook={handleStartRunbook}
          onForceRecycle={(agent) => showToast(`Runtime recycle requested for ${agent.name}`)}
        />
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container items-center justify-center">
          <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Loading Supr command deck...</p>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
