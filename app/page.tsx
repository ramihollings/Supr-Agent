"use client";

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '@/components/TopNav';
import { MissionWizard } from '@/components/MissionWizard';
import { SetupWizard } from '@/components/SetupWizard';
import { ProjectWorkflowCanvas } from '@/components/ProjectWorkflowCanvas';
import { DashboardObjectDrawer } from '@/components/DashboardObjectDrawer';
import { RunTranscriptView } from '@/components/RunTranscriptView';
import { RuntimeConsoleStrip } from '@/components/RuntimeConsoleStrip';
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('work');
  const [selectedObject, setSelectedObject] = useState<DashboardObject | null>(null);

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

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2600);
  };

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
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-background border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-xs">
          {toastMessage}
        </div>
      )}
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
        <aside className={`${mobilePanel === 'objects' ? 'flex' : 'hidden'} xl:flex w-full xl:w-[320px] shrink-0 border-r-4 border-primary bg-background flex-col overflow-y-auto custom-scrollbar`}>
          <div className="p-5 border-b-4 border-primary bg-surface-container-high">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-headline font-black uppercase text-2xl text-primary tracking-tight">Objects</h1>
                <p className="font-body text-xs text-on-surface-variant font-semibold mt-1">Projects, files, messages, sub-agents, and supervisor context in one rail.</p>
              </div>
              <button
                onClick={() => setShowWizard(true)}
                className="bg-primary text-on-primary neo-border p-2 hover:bg-tertiary hover:text-on-tertiary"
                title="Create project"
              >
                <span className="material-symbols-outlined text-lg">add</span>
              </button>
            </div>
          </div>

          <section className="p-4 border-b-4 border-primary">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-headline font-black uppercase text-xs text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">folder_managed</span>
                Projects
              </h2>
              <button onClick={refreshAll} className="text-primary hover:text-tertiary" title="Refresh">
                <span className="material-symbols-outlined text-sm">refresh</span>
              </button>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="font-mono text-[10px] uppercase text-on-surface-variant p-4 border border-dashed border-primary">Loading project objects...</div>
              ) : projects.length === 0 ? (
                <button onClick={() => setShowWizard(true)} className="w-full p-4 border-2 border-dashed border-primary text-left hover:bg-surface-container">
                  <span className="font-headline font-bold uppercase text-xs text-primary">Create the first project</span>
                </button>
              ) : projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectSelect(project.id)}
                  className={`w-full text-left p-3 border-2 transition-colors ${
                    selectedOrFirstProjectId === project.id
                      ? 'border-primary bg-primary-container shadow-[3px_3px_0px_0px_var(--color-primary)]'
                      : 'border-outline-variant bg-surface hover:border-primary'
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-headline font-black uppercase text-sm truncate">{project.name}</span>
                    <span className="font-mono text-[9px] uppercase text-secondary">{project.status}</span>
                  </div>
                  <p className="font-body text-[10px] text-on-surface-variant line-clamp-2 mt-1">{project.objective || 'No objective yet.'}</p>
                  <div className="mt-2 h-2 bg-background border border-primary overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${project.readinessScore || 0}%` }} />
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="p-4 border-b-4 border-primary">
            <h2 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">smart_toy</span>
              Sub-agents
            </h2>
            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {activeAgents.slice(0, 7).map((agent) => (
                <div key={agent.id} className="bg-surface border-2 border-primary p-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-headline font-bold uppercase text-[10px] truncate">{agent.name}</span>
                    <span className="font-mono text-[8px] uppercase text-tertiary">{agent.status}</span>
                  </div>
                  <p className="font-body text-[10px] text-on-surface-variant truncate">{agent.role} · {agent.permissionTier}</p>
                </div>
              ))}
            </div>
            <Link href="/agents" className="mt-3 flex items-center justify-center gap-1.5 bg-background border-2 border-primary px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-primary hover:text-on-primary">
              <span className="material-symbols-outlined text-sm">edit_square</span>
              Edit agent roster
            </Link>
          </section>

          <section className="p-4">
            <h2 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">draft</span>
              Workspace Files
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/library" className="bg-surface border-2 border-primary p-3 hover:bg-primary hover:text-on-primary">
                <span className="material-symbols-outlined text-lg">folder_open</span>
                <span className="block font-headline font-bold uppercase text-[10px] mt-1">Upload/Edit</span>
              </Link>
              <Link href="/code" className="bg-surface border-2 border-primary p-3 hover:bg-primary hover:text-on-primary">
                <span className="material-symbols-outlined text-lg">terminal</span>
                <span className="block font-headline font-bold uppercase text-[10px] mt-1">Run Files</span>
              </Link>
            </div>
            <p className="font-mono text-[9px] uppercase text-on-surface-variant mt-3">{workspaceFiles.length} files in sandbox workspace</p>
          </section>

          <section className="p-4 border-t-4 border-primary">
            <h2 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">manage_search</span>
              Object Inspector
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {dashboardObjects.slice(0, 12).map((object) => (
                <button
                  key={`${object.type}-${object.id}`}
                  onClick={() => setSelectedObject(object)}
                  className="w-full text-left bg-surface border-2 border-primary p-2 hover:bg-primary hover:text-on-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-headline font-bold uppercase text-[10px] truncate">{object.title}</span>
                    <span className="font-mono text-[8px] uppercase">{object.type}</span>
                  </div>
                  <p className="font-body text-[10px] opacity-80 truncate">{object.owner} / {object.status}</p>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className={`${mobilePanel === 'work' ? 'flex' : 'hidden'} xl:flex flex-1 flex-col overflow-y-auto custom-scrollbar bg-surface-container-lowest border-r-4 border-primary`}>
          <header className="p-5 lg:p-6 border-b-4 border-primary bg-background">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary">dashboard_customize</span>
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">Supervisor governed command deck</span>
                </div>
                {selectedProject ? (
                  editingProject ? (
                    <div className="space-y-3">
                      <input
                        value={projectDraft.name}
                        onChange={(event) => setProjectDraft((prev) => ({ ...prev, name: event.target.value }))}
                        className="w-full bg-surface neo-border px-3 py-2 font-headline font-black uppercase text-xl focus:outline-none focus:border-tertiary"
                      />
                      <textarea
                        value={projectDraft.objective}
                        onChange={(event) => setProjectDraft((prev) => ({ ...prev, objective: event.target.value }))}
                        className="w-full min-h-[88px] bg-surface neo-border px-3 py-2 font-body text-sm focus:outline-none focus:border-tertiary resize-vertical"
                      />
                      <select
                        value={projectDraft.status}
                        onChange={(event) => setProjectDraft((prev) => ({ ...prev, status: event.target.value as Mission['status'] }))}
                        className="bg-surface neo-border px-3 py-2 font-headline font-bold uppercase text-xs focus:outline-none focus:border-tertiary"
                      >
                        <option value="Active">Active</option>
                        <option value="Done">Done</option>
                        <option value="Failed">Failed</option>
                      </select>
                    </div>
                  ) : (
                    <>
                      <h2 className="font-headline font-black uppercase text-3xl lg:text-4xl text-primary tracking-tight truncate">{selectedProject.name}</h2>
                      <p className="font-body text-sm lg:text-base font-semibold text-on-surface-variant max-w-3xl mt-2">{selectedProject.objective || 'No objective defined.'}</p>
                    </>
                  )
                ) : (
                  <>
                    <h2 className="font-headline font-black uppercase text-3xl lg:text-4xl text-primary tracking-tight">No project selected</h2>
                    <p className="font-body text-sm lg:text-base font-semibold text-on-surface-variant max-w-3xl mt-2">Create or select a project to start assigning work, collecting evidence, and supervising agent execution.</p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                {editingProject ? (
                  <>
                    <button onClick={handleSaveProject} className="bg-primary text-on-primary neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-tertiary hover:text-on-tertiary">Save</button>
                    <button onClick={() => setEditingProject(false)} className="bg-background text-primary neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-surface-container">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditingProject(true)} disabled={!selectedProject} className="bg-background text-primary neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-surface-container disabled:opacity-50">
                      <span className="material-symbols-outlined text-sm align-middle mr-1">edit</span>
                      Edit
                    </button>
                    <button onClick={handleExportProject} disabled={!selectedProject} className="bg-background text-primary neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-surface-container disabled:opacity-50">
                      <span className="material-symbols-outlined text-sm align-middle mr-1">download</span>
                      Download
                    </button>
                    <Link href="/supr-chat" className="bg-primary text-on-primary neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-tertiary hover:text-on-tertiary text-center">
                      <span className="material-symbols-outlined text-sm align-middle mr-1">chat</span>
                      Message
                    </Link>
                    <button onClick={handleDeleteProject} disabled={!selectedProject} className="bg-error text-on-error neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-primary disabled:opacity-50">
                      <span className="material-symbols-outlined text-sm align-middle mr-1">delete</span>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>

          <section className="grid grid-cols-2 lg:grid-cols-4 border-b-4 border-primary bg-surface-container-high">
            {[
              { label: 'Tasks done', value: `${projectStats.doneTasks}/${projectStats.totalTasks}`, icon: 'task_alt' },
              { label: 'Open actions', value: projectStats.openActions, icon: 'play_circle' },
              { label: 'Approvals', value: pendingApprovals.length, icon: 'approval_delegation' },
              { label: 'Workspace files', value: projectStats.files, icon: 'draft' },
            ].map((stat) => (
              <div key={stat.label} className="p-4 border-r-2 last:border-r-0 border-primary">
                <span className="material-symbols-outlined text-primary text-lg">{stat.icon}</span>
                <p className="font-headline font-black text-2xl text-secondary">{stat.value}</p>
                <p className="font-headline font-bold uppercase text-[9px] text-on-surface-variant">{stat.label}</p>
              </div>
            ))}
          </section>

          <div className="p-4 lg:p-6 space-y-6">
            {selectedProject ? (
              <ProjectWorkflowCanvas
                graph={operatingGraph}
                onSpawnAgent={handleSpawnProjectAgent}
                onStartFlow={() => handleFlowControl('start')}
                onRunFlow={() => handleFlowControl('run')}
                onPauseFlow={() => handleFlowControl('pause')}
                onResumeFlow={() => handleFlowControl('resume')}
                onRetryFailed={() => handleFlowControl('retry')}
                onApproveLowRisk={() => handleFlowControl('approveLowRisk')}
                isSpawning={isSpawningAgent}
                isBusy={isFlowBusy}
              />
            ) : (
              <div className="bg-background neo-border p-8 text-center">
                <span className="material-symbols-outlined text-5xl text-primary/40">hub</span>
                <h3 className="font-headline font-black uppercase text-xl text-primary mt-3">Select a project to open the work graph</h3>
                <button onClick={() => setShowWizard(true)} className="mt-4 bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs hover:bg-tertiary hover:text-on-tertiary">
                  Create project
                </button>
              </div>
            )}

            <RunTranscriptView events={runEvents} title="Evidence-backed run transcript" />

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-background neo-border p-4">
                <h3 className="font-headline font-black uppercase text-sm text-primary border-b-2 border-primary pb-2 mb-3">Recent evidence</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {timeline.slice(0, 6).map((item) => (
                    <div key={`${item.source}-${item.id}`} className="border-l-4 border-tertiary pl-3 py-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-headline font-bold uppercase text-[10px] truncate">{item.title}</span>
                        <span className="font-mono text-[8px] uppercase text-on-surface-variant">{item.mode}</span>
                      </div>
                      <p className="font-body text-[10px] text-on-surface-variant line-clamp-2">{item.detail}</p>
                    </div>
                  ))}
                  {timeline.length === 0 && <p className="font-body text-xs text-on-surface-variant">No timeline events yet.</p>}
                </div>
              </div>

              <div className="bg-background neo-border p-4">
                <h3 className="font-headline font-black uppercase text-sm text-primary border-b-2 border-primary pb-2 mb-3">Deliverables</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {artifactVersions.slice(0, 6).map((artifact) => (
                    <Link key={artifact.id} href="/library" className="block bg-surface border border-outline-variant p-2 hover:border-primary">
                      <span className="font-headline font-bold uppercase text-[10px] truncate block">{artifact.filename}</span>
                      <span className="font-mono text-[9px] uppercase text-on-surface-variant">v{artifact.version} · {artifact.status}</span>
                    </Link>
                  ))}
                  {artifactVersions.length === 0 && projectArtifacts.map((artifact) => (
                    <Link key={artifact.id} href="/library" className="block bg-surface border border-outline-variant p-2 hover:border-primary">
                      <span className="font-headline font-bold uppercase text-[10px] truncate block">{artifact.filename}</span>
                      <span className="font-mono text-[9px] uppercase text-on-surface-variant">{artifact.type}</span>
                    </Link>
                  ))}
                  {artifactVersions.length === 0 && projectArtifacts.length === 0 && <p className="font-body text-xs text-on-surface-variant">No deliverables yet.</p>}
                </div>
              </div>

              <div className="bg-background neo-border p-4">
                <h3 className="font-headline font-black uppercase text-sm text-primary border-b-2 border-primary pb-2 mb-3">Supervisor memory</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {memoryPreview.map((item) => (
                    <div key={item.id} className="bg-surface border border-outline-variant p-2">
                      <span className="font-headline font-bold uppercase text-[10px] truncate block">{item.key}</span>
                      <p className="font-body text-[10px] text-on-surface-variant line-clamp-2">{item.value}</p>
                    </div>
                  ))}
                  {memoryPreview.length === 0 && <p className="font-body text-xs text-on-surface-variant">No memory items are waiting for review.</p>}
                </div>
              </div>
            </section>
          </div>
        </main>

        <aside className={`${mobilePanel === 'ops' ? 'flex' : 'hidden'} xl:flex w-full xl:w-[340px] shrink-0 bg-background flex-col overflow-y-auto custom-scrollbar`}>
          <section className="p-5 border-b-4 border-primary bg-surface-container-high">
            <h2 className="font-headline font-black uppercase text-xl text-primary tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined">tune</span>
              Operations
            </h2>
            <p className="font-body text-xs text-on-surface-variant font-semibold mt-1">The governing agent’s control surface: approvals, groups, providers, and object actions.</p>
          </section>

          <section className="p-4 border-b-4 border-primary">
            <RuntimeConsoleStrip
              agents={agents}
              approvals={approvals}
              metrics={supervisorConsole?.metrics || []}
              onForceRecycle={(agent) => showToast(`Runtime recycle requested for ${agent.name}`)}
            />
          </section>

          <section className="p-4 border-b-4 border-primary">
            <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">approval_delegation</span>
              Approval queue
            </h3>
            <div className="space-y-2">
              {pendingApprovals.slice(0, 4).map((approval) => (
                <div key={approval.id} className="bg-surface neo-border p-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-headline font-black uppercase text-[10px] truncate">{approval.action}</span>
                    <span className="font-mono text-[9px] uppercase text-secondary">{approval.riskLevel}</span>
                  </div>
                  <p className="font-body text-[10px] text-on-surface-variant line-clamp-2 mt-1">{approval.reason}</p>
                  <div className="grid grid-cols-3 gap-1 mt-3">
                    {(['approved', 'rejected', 'revised'] as const).map((decision) => (
                      <button
                        key={decision}
                        onClick={() => handleApprovalDecision(approval.id, decision)}
                        className="border border-primary px-1 py-1 font-headline font-bold uppercase text-[8px] hover:bg-primary hover:text-on-primary"
                      >
                        {decision}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {pendingApprovals.length === 0 && <p className="font-body text-xs text-on-surface-variant">No pending approvals.</p>}
            </div>
          </section>

          <section className="p-4 border-b-4 border-primary">
            <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">groups</span>
              Supervisor teams
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-surface border-2 border-primary p-3">
                <span className="font-headline font-black text-2xl text-secondary">{supervisorGroups.length}</span>
                <p className="font-headline font-bold uppercase text-[9px] text-on-surface-variant">Agent groups</p>
              </div>
              <div className="bg-surface border-2 border-primary p-3">
                <span className="font-headline font-black text-2xl text-tertiary">{blueprintCount}</span>
                <p className="font-headline font-bold uppercase text-[9px] text-on-surface-variant">Blueprints</p>
              </div>
            </div>
            <Link href={`/supervisor${selectedOrFirstProjectId ? `?id=${selectedOrFirstProjectId}` : ''}`} className="flex items-center justify-center gap-1.5 bg-primary text-on-primary neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-tertiary hover:text-on-tertiary">
              <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
              Open supervisor console
            </Link>
          </section>

          <section className="p-4 border-b-4 border-primary">
            <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">conversion_path</span>
              Runbooks
            </h3>
            <div className="space-y-2">
              {runbooks.slice(0, 4).map((runbook) => (
                <div key={runbook.id} className="bg-surface border-2 border-primary p-3">
                  <span className="font-headline font-bold uppercase text-[10px] block">{runbook.name}</span>
                  <p className="font-body text-[10px] text-on-surface-variant line-clamp-2 mt-1">{runbook.description}</p>
                  <button
                    onClick={() => handleStartRunbook(runbook.id)}
                    className="mt-2 w-full bg-background border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
                  >
                    Start
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="p-4">
            <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">settings_input_component</span>
              Providers
            </h3>
            <div className="space-y-2">
              {connectors.map((connector) => (
                <div key={connector.id} className="flex items-center justify-between bg-surface border border-outline-variant p-2">
                  <span className="font-headline font-bold uppercase text-[10px] truncate">{connector.name}</span>
                  <span className={`font-mono text-[9px] uppercase ${connector.configured ? 'text-tertiary' : 'text-on-surface-variant'}`}>{connector.status}</span>
                </div>
              ))}
            </div>
            <Link href="/settings" className="mt-3 flex items-center justify-center gap-1.5 bg-background border-2 border-primary px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-primary hover:text-on-primary">
              <span className="material-symbols-outlined text-sm">settings</span>
              Configure
            </Link>
          </section>
        </aside>
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
