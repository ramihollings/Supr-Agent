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
  fetchBootstrapStateAction,
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
  deleteWorkspaceFileAction,
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
  const [bulkSelectedObjects, setBulkSelectedObjects] = useState<Set<string>>(new Set());
  // Live Mission Control status. Updated by the SSE subscription below
  // and surfaced in the header so the user can see when the stream is
  // connected, when it last received an event, and how many tool calls
  // the active project has produced.
  const [sseStatus, setSseStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [sseLastEventAt, setSseLastEventAt] = useState<string | null>(null);
  const [recentToolCallCount, setRecentToolCallCount] = useState(0);
  const [liveEvent, setLiveEvent] = useState<{ summary: string; at: string; tone: 'success' | 'failure' | 'system' } | null>(null);
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
      const [projectRows, agentRows, fileRows, connectorRows, runbookRows, memoryRows, approvalRows, bootstrap] = await Promise.all([
        fetchMissionsAction(),
        fetchAgentStatuses(),
        fetchWorkspaceFilesAction(),
        fetchConnectorHealthAction(),
        fetchRunbooksAction(),
        fetchMemoryItemsAction(),
        fetchApprovalCenterAction(),
        fetchBootstrapStateAction(),
      ]);
      setProjects(projectRows);
      setAgents(agentRows);
      setWorkspaceFiles(fileRows);
      setConnectors(connectorRows);
      setRunbooks(runbookRows);
      setMemoryPreview(memoryRows.slice(0, 5));
      setApprovals(approvalRows);
      setBootstrapRequired(bootstrap.wizardRequired);
      setShowSetupWizard(bootstrap.wizardRequired);
      if (bootstrap.wizardRequired) {
        console.info(`[Supr] Setup wizard required: ${bootstrap.reason}`);
      }
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

  const handleExportProject = async (projectId?: string) => {
    const targetId = projectId || selectedProject?.id;
    if (!targetId) return;
    const res = await exportMissionBundleAction(targetId);
    if (res.success) {
      const projectName = projects.find((p) => p.id === targetId)?.name || 'project';
      downloadJson(`${projectName.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}-supr-bundle.json`, res.bundle);
      showToast('Project bundle downloaded');
    } else {
      showToast(res.error || 'Project export failed');
    }
  };

  const handleDeleteProjectById = async (projectId: string) => {
    if (!projectId) return;
    const projectName = projects.find((p) => p.id === projectId)?.name || 'project';
    if (!confirm(`Delete ${projectName} and its project runtime records?`)) return;
    const res = await deleteMissionAction(projectId);
    if (res.success) {
      showToast('Project deleted');
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        router.push('/');
      }
      await loadBaseData();
    } else {
      showToast(res.error || 'Project delete failed');
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    await handleDeleteProjectById(selectedProject.id);
  };

  const handleToggleBulkSelection = (id: string) => {
    const newSet = new Set(bulkSelectedObjects);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setBulkSelectedObjects(newSet);
  };

  const handleBulkDelete = async () => {
    if (bulkSelectedObjects.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${bulkSelectedObjects.size} selected items?`)) return;

    let deletedCount = 0;
    for (const id of Array.from(bulkSelectedObjects)) {
      const obj = dashboardObjects.find(o => o.id === id);
      if (!obj) continue;
      
      if (obj.type === 'project') {
        const res = await deleteMissionAction(id);
        if (res.success) deletedCount++;
      } else if (obj.type === 'file') {
        const res = await deleteWorkspaceFileAction(id);
        if (res.success) deletedCount++;
      }
    }

    showToast(`Successfully deleted ${deletedCount} item(s)`);
    setBulkSelectedObjects(new Set());
    await refreshAll();
  };

  const handleObjectAction = async (action: ObjectAction, object: DashboardObject) => {
    if (!action.enabled) {
      showToast(action.reason || 'Action is not available');
      return;
    }

    if (object.type === 'project') {
      if (action.id === 'open') handleProjectSelect(object.id);
      if (action.id === 'edit' && selectedProject?.id === object.id) setEditingProject(true);
      // Export/delete must target the object the user clicked, not
      // the currently selected project. Previously these called
      // handleExportProject() / handleDeleteProject() which used
      // `selectedProject`, so clicking export on Project B while
      // Project A was selected would export A.
      if (action.id === 'download' || action.id === 'export') await handleExportProject(object.id);
      if (action.id === 'delete') await handleDeleteProjectById(object.id);
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
    try {
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
    } catch (error) {
      // Without this catch, a thrown server action would leave the
      // "busy" spinner stuck forever because the finally below never
      // ran on the rejection path.
      showToast(error instanceof Error ? error.message : 'Project flow failed');
    } finally {
      setIsFlowBusy(false);
    }
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
    try {
      const res = await spawnProjectAgentAction({
        missionId: selectedOrFirstProjectId,
        ...draft,
      });
      showToast(res.success ? 'Agent spawned into project flow' : res.error || 'Agent spawn failed');
      await refreshAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent spawn failed');
    } finally {
      setIsSpawningAgent(false);
    }
  };

  // Live updates via Server-Sent Events. The /api/mission/stream route
  // emits a `mission` event with the refreshed Mission payload whenever
  // the server detects a state change. We debounce the refresh so a
  // burst of events coalesces into a single reload, then close the
  // stream when the selected project changes or the component unmounts.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL('/api/mission/stream', window.location.origin);
    if (selectedOrFirstProjectId) url.searchParams.set('id', selectedOrFirstProjectId);
    const source = new EventSource(url.toString());
    setSseStatus('connecting');
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleMissionEvent = (event: MessageEvent) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refreshAll();
      }, 400);
      setSseLastEventAt(new Date().toISOString());
      try {
        const payload = JSON.parse(event.data);
        if (payload?.summary) {
          setLiveEvent({
            summary: payload.summary,
            at: new Date().toISOString(),
            tone: payload.eventType === 'failure' ? 'failure' : payload.eventType === 'agent_action' ? 'success' : 'system',
          });
        }
      } catch {
        // ignore unparseable
      }
    };
    const handleToolEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.toolName === 'web_scrape') {
          setRecentToolCallCount((c) => c + 1);
        }
      } catch {
        // ignore
      }
    };
    source.addEventListener('open', () => setSseStatus('open'));
    source.addEventListener('error', () => setSseStatus('closed'));
    source.addEventListener('mission', handleMissionEvent);
    source.addEventListener('tool', handleToolEvent);
    return () => {
      source.removeEventListener('mission', handleMissionEvent);
      source.removeEventListener('tool', handleToolEvent);
      source.close();
      setSseStatus('closed');
      if (debounceTimer) clearTimeout(debounceTimer);
    };
    // We intentionally exclude refreshAll from deps to avoid
    // re-subscribing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrFirstProjectId]);

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
      <LiveStatusBar
        sseStatus={sseStatus}
        sseLastEventAt={sseLastEventAt}
        recentToolCallCount={recentToolCallCount}
        liveEvent={liveEvent}
      />

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
          bulkSelectedObjects={bulkSelectedObjects}
          onToggleBulkSelection={handleToggleBulkSelection}
          onBulkDelete={handleBulkDelete}
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

function LiveStatusBar({
  sseStatus,
  sseLastEventAt,
  recentToolCallCount,
  liveEvent,
}: {
  sseStatus: 'connecting' | 'open' | 'closed';
  sseLastEventAt: string | null;
  recentToolCallCount: number;
  liveEvent: { summary: string; at: string; tone: 'success' | 'failure' | 'system' } | null;
}) {
  const statusLabel = sseStatus === 'open' ? 'Live' : sseStatus === 'connecting' ? 'Connecting…' : 'Offline';
  const statusTone =
    sseStatus === 'open'
      ? 'bg-tertiary text-on-tertiary'
      : sseStatus === 'connecting'
        ? 'bg-secondary text-on-error animate-pulse'
        : 'bg-error text-on-error';
  return (
    <div className="flex items-center gap-2 border-b-2 border-primary bg-surface-container px-3 py-1.5 text-[10px] font-mono shrink-0 overflow-x-auto custom-scrollbar" role="status" aria-live="polite">
      <span
        className={`px-2 py-0.5 border-2 border-primary font-headline font-black uppercase text-[9px] ${statusTone}`}
        title={`Server-Sent Events stream status: ${statusLabel}`}
      >
        <span className="material-symbols-outlined text-[10px] align-middle">sensors</span>
        <span className="ml-1">{statusLabel}</span>
      </span>
      <span className="text-on-surface-variant flex items-center gap-1" title="Most recent mission event seen on the stream">
        <span className="material-symbols-outlined text-[12px]">schedule</span>
        {sseLastEventAt ? new Date(sseLastEventAt).toLocaleTimeString() : '—'}
      </span>
      <span className="text-on-surface-variant flex items-center gap-1" title="CloakBrowser web_scrape invocations observed in this session">
        <span className="material-symbols-outlined text-[12px]">travel_explore</span>
        {recentToolCallCount} web_scrape
      </span>
      {liveEvent && (
        <span
          className={`ml-2 px-2 py-0.5 border-2 border-primary font-headline font-bold uppercase text-[9px] truncate max-w-[40rem] ${
            liveEvent.tone === 'failure'
              ? 'bg-error text-on-error'
              : liveEvent.tone === 'success'
                ? 'bg-tertiary text-on-tertiary'
                : 'bg-secondary text-on-primary'
          }`}
          title={liveEvent.summary}
        >
          {liveEvent.summary}
        </span>
      )}
    </div>
  );
}
