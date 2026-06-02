"use client";

import Link from "next/link";
import { ProjectWorkflowCanvas } from "@/components/ProjectWorkflowCanvas";
import { RunTranscriptView } from "@/components/RunTranscriptView";
import type { Mission, RunEvent } from "@/types";

export interface WorkPanelProjectDraft {
  name: string;
  objective: string;
  status: Mission["status"];
}

export interface WorkPanelStats {
  totalTasks: number;
  doneTasks: number;
  openActions: number;
  files: number;
}

export interface WorkPanelTimelineItem {
  id: string;
  source: string;
  title: string;
  detail: string;
  mode: string;
}

export interface WorkPanelArtifactVersion {
  id: string;
  filename: string;
  version: string | number;
  status: string;
}

export interface WorkPanelArtifact {
  id: string;
  filename: string;
  type: string;
}

export interface WorkPanelMemoryItem {
  id: string;
  key: string;
  value: string;
}

export interface WorkPanelProps {
  mobilePanel: string;
  selectedProject: Mission | null;
  editingProject: boolean;
  projectDraft: WorkPanelProjectDraft;
  projectStats: WorkPanelStats;
  pendingApprovalsCount: number;
  operatingGraph: unknown;
  runEvents: RunEvent[];
  timeline: WorkPanelTimelineItem[];
  artifactVersions: WorkPanelArtifactVersion[];
  projectArtifacts: WorkPanelArtifact[];
  memoryPreview: WorkPanelMemoryItem[];
  isFlowBusy: boolean;
  isSpawningAgent: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onChangeDraft: (draft: WorkPanelProjectDraft) => void;
  onExport: () => void;
  onDelete: () => void;
  onCreateProject: () => void;
  onSpawnAgent: (draft: {
    role: string;
    objective: string;
    permissionTier: string;
    capability: string;
    riskLevel: "Low" | "Medium" | "High" | "Critical";
  }) => void;
  onFlowControl: (action: "start" | "run" | "pause" | "resume" | "retry" | "approveLowRisk") => void;
}

export function WorkPanel({
  mobilePanel,
  selectedProject,
  editingProject,
  projectDraft,
  projectStats,
  pendingApprovalsCount,
  operatingGraph,
  runEvents,
  timeline,
  artifactVersions,
  projectArtifacts,
  memoryPreview,
  isFlowBusy,
  isSpawningAgent,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeDraft,
  onExport,
  onDelete,
  onCreateProject,
  onSpawnAgent,
  onFlowControl,
}: WorkPanelProps) {
  return (
    <main
      className={`${mobilePanel === "work" ? "flex" : "hidden"} xl:flex flex-1 flex-col overflow-y-auto custom-scrollbar bg-surface-container-lowest border-r-4 border-primary`}
    >
      <header className="p-5 lg:p-6 border-b-4 border-primary bg-background">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">dashboard_customize</span>
              <span className="font-mono text-[10px] uppercase text-on-surface-variant">Supervisor governed command deck</span>
            </div>
            {selectedProject ? (
              editingProject ? (
                <div className="space-y-3">
                  <label htmlFor="project-name-input" className="sr-only">Project name</label>
                  <input
                    id="project-name-input"
                    aria-label="Project name"
                    value={projectDraft.name}
                    onChange={(event) => onChangeDraft({ ...projectDraft, name: event.target.value })}
                    className="w-full bg-surface border-2 border-outline-variant rounded px-3 py-2 font-headline text-xl font-black uppercase focus:outline-none focus:border-primary"
                  />
                  <label htmlFor="project-objective-input" className="sr-only">Project objective</label>
                  <textarea
                    id="project-objective-input"
                    aria-label="Project objective"
                    value={projectDraft.objective}
                    onChange={(event) => onChangeDraft({ ...projectDraft, objective: event.target.value })}
                    className="w-full min-h-[88px] bg-surface border-2 border-outline-variant rounded px-3 py-2 font-body text-sm focus:outline-none focus:border-primary resize-vertical"
                  />
                  <label htmlFor="project-status-select" className="sr-only">Project status</label>
                  <select
                    id="project-status-select"
                    aria-label="Project status"
                    value={projectDraft.status}
                    onChange={(event) => onChangeDraft({ ...projectDraft, status: event.target.value as Mission["status"] })}
                    className="bg-surface border-2 border-outline-variant rounded px-3 py-2 font-headline font-bold uppercase text-xs focus:outline-none focus:border-primary"
                  >
                    <option value="Active">Active</option>
                    <option value="Done">Done</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
              ) : (
                <>
                  <h2 className="font-headline font-black uppercase text-3xl lg:text-4xl text-primary tracking-tight truncate">
                    {selectedProject.name}
                  </h2>
                  <p className="font-body text-sm lg:text-base font-semibold text-on-surface-variant max-w-3xl mt-2">
                    {selectedProject.objective || "No objective defined."}
                  </p>
                </>
              )
            ) : (
              <>
                <h2 className="font-headline font-black uppercase text-3xl lg:text-4xl text-primary tracking-tight">No project selected</h2>
                <p className="font-body text-sm lg:text-base font-semibold text-on-surface-variant max-w-3xl mt-2">
                  Create or select a project to start assigning work, collecting evidence, and supervising agent execution.
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
            {editingProject ? (
              <>
                <button
                  onClick={onSaveEdit}
                  className="bg-primary text-on-primary rounded px-3 py-2 font-body text-xs font-semibold uppercase hover:bg-tertiary hover:text-on-tertiary"
                >
                  Save
                </button>
                <button
                  onClick={onCancelEdit}
                  className="bg-background text-primary border border-outline-variant rounded px-3 py-2 font-body text-xs font-semibold uppercase hover:bg-surface-container"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onStartEdit}
                  disabled={!selectedProject}
                  className="bg-background text-primary border border-outline-variant rounded px-3 py-2 font-body text-xs font-semibold uppercase hover:bg-surface-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1" aria-hidden="true">edit</span>
                  Edit
                </button>
                <button
                  onClick={onExport}
                  disabled={!selectedProject}
                  className="bg-background text-primary border border-outline-variant rounded px-3 py-2 font-body text-xs font-semibold uppercase hover:bg-surface-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1" aria-hidden="true">download</span>
                  Download
                </button>
                <Link
                  href="/supr-chat"
                  className="bg-primary text-on-primary rounded px-3 py-2 font-body text-xs font-semibold uppercase hover:bg-tertiary hover:text-on-tertiary text-center"
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1" aria-hidden="true">chat</span>
                  Message
                </Link>
                <button
                  onClick={onDelete}
                  disabled={!selectedProject}
                  className="bg-error text-on-error rounded px-3 py-2 font-body text-xs font-semibold uppercase hover:bg-primary disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm align-middle mr-1" aria-hidden="true">delete</span>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 border-b-4 border-primary bg-surface-container-high">
        {[
          { label: "Tasks done", value: `${projectStats.doneTasks}/${projectStats.totalTasks}`, icon: "task_alt" },
          { label: "Open actions", value: projectStats.openActions, icon: "play_circle" },
          { label: "Approvals", value: pendingApprovalsCount, icon: "approval_delegation" },
          { label: "Workspace files", value: projectStats.files, icon: "draft" },
        ].map((stat) => (
          <div key={stat.label} className="p-4 border-r-2 last:border-r-0 border-primary">
            <span className="material-symbols-outlined text-primary text-lg" aria-hidden="true">{stat.icon}</span>
            <p className="font-headline font-black text-2xl text-secondary">{stat.value}</p>
            <p className="font-body text-[10px] uppercase font-semibold text-on-surface-variant">{stat.label}</p>
          </div>
        ))}
      </section>

      <div className="p-4 lg:p-6 space-y-6">
        {selectedProject ? (
          <ProjectWorkflowCanvas
            graph={operatingGraph as any}
            onSpawnAgent={onSpawnAgent as any}
            onStartFlow={async () => {
              onFlowControl("start");
            }}
            onRunFlow={async () => {
              onFlowControl("run");
            }}
            onPauseFlow={async () => {
              onFlowControl("pause");
            }}
            onResumeFlow={async () => {
              onFlowControl("resume");
            }}
            onRetryFailed={async () => {
              onFlowControl("retry");
            }}
            onApproveLowRisk={async () => {
              onFlowControl("approveLowRisk");
            }}
            isSpawning={isSpawningAgent}
            isBusy={isFlowBusy}
          />
        ) : (
          <div className="bg-background border-2 border-outline-variant rounded p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant" aria-hidden="true">hub</span>
            <h3 className="font-headline font-black uppercase text-xl text-primary mt-3">Select a project to open the work graph</h3>
            <button
              onClick={onCreateProject}
              className="mt-4 bg-primary text-on-primary rounded px-4 py-2 font-body text-xs font-semibold uppercase hover:bg-tertiary hover:text-on-tertiary"
            >
              Create project
            </button>
          </div>
        )}

        <RunTranscriptView events={runEvents} title="Evidence-backed run transcript" />

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-background border-2 border-outline-variant rounded p-4">
            <h3 className="font-headline font-black uppercase text-sm text-primary border-b-2 border-primary pb-2 mb-3">Recent evidence</h3>
            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {timeline.slice(0, 6).map((item) => (
                <div key={`${item.source}-${item.id}`} className="border-l-4 border-tertiary pl-3 py-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-body text-xs font-semibold truncate">{item.title}</span>
                    <span className="font-mono text-[9px] uppercase text-on-surface-variant">{item.mode}</span>
                  </div>
                  <p className="font-body text-[10px] text-on-surface-variant line-clamp-2">{item.detail}</p>
                </div>
              ))}
              {timeline.length === 0 && (
                <div className="text-center py-4">
                  <span className="material-symbols-outlined text-on-surface-variant text-2xl" aria-hidden="true">history</span>
                  <p className="font-body text-xs text-on-surface-variant mt-1">No timeline events yet.</p>
                  <p className="font-body text-[10px] text-on-surface-variant">Run a project to start collecting evidence.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-background border-2 border-outline-variant rounded p-4">
            <h3 className="font-headline font-black uppercase text-sm text-primary border-b-2 border-primary pb-2 mb-3">Deliverables</h3>
            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {artifactVersions.slice(0, 6).map((artifact) => (
                <Link
                  key={artifact.id}
                  href="/library"
                  className="block bg-surface border border-outline-variant rounded p-2 hover:border-primary"
                >
                  <span className="font-body text-xs font-semibold truncate block">{artifact.filename}</span>
                  <span className="font-mono text-[9px] uppercase text-on-surface-variant">
                    v{artifact.version} &middot; {artifact.status}
                  </span>
                </Link>
              ))}
              {artifactVersions.length === 0 &&
                projectArtifacts.map((artifact) => (
                  <Link
                    key={artifact.id}
                    href="/library"
                    className="block bg-surface border border-outline-variant rounded p-2 hover:border-primary"
                  >
                    <span className="font-body text-xs font-semibold truncate block">{artifact.filename}</span>
                    <span className="font-mono text-[9px] uppercase text-on-surface-variant">{artifact.type}</span>
                  </Link>
                ))}
              {artifactVersions.length === 0 && projectArtifacts.length === 0 && (
                <div className="text-center py-4">
                  <span className="material-symbols-outlined text-on-surface-variant text-2xl" aria-hidden="true">draft</span>
                  <p className="font-body text-xs text-on-surface-variant mt-1">No deliverables yet.</p>
                  <p className="font-body text-[10px] text-on-surface-variant">Agents will save outputs here as they work.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-background border-2 border-outline-variant rounded p-4">
            <h3 className="font-headline font-black uppercase text-sm text-primary border-b-2 border-primary pb-2 mb-3">Supervisor memory</h3>
            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {memoryPreview.map((item) => (
                <div key={item.id} className="bg-surface border border-outline-variant rounded p-2">
                  <span className="font-body text-xs font-semibold truncate block">{item.key}</span>
                  <p className="font-body text-[10px] text-on-surface-variant line-clamp-2">{item.value}</p>
                </div>
              ))}
              {memoryPreview.length === 0 && (
                <div className="text-center py-4">
                  <span className="material-symbols-outlined text-on-surface-variant text-2xl" aria-hidden="true">memory</span>
                  <p className="font-body text-xs text-on-surface-variant mt-1">Nothing in supervisor memory yet.</p>
                  <p className="font-body text-[10px] text-on-surface-variant">Facts the supervisor learns will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
