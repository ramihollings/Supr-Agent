"use client";

import Link from "next/link";
import type { Mission } from "@/types";
import type { DashboardObject } from "@/types";

export interface ObjectsRailAgent {
  id: string;
  name: string;
  role: string;
  permissionTier: string;
  status: string;
}

export interface ObjectsRailFile {
  filename: string;
}

export interface ObjectsRailProps {
  mobilePanel: string;
  loading: boolean;
  projects: Mission[];
  activeAgents: ObjectsRailAgent[];
  workspaceFiles: ObjectsRailFile[];
  dashboardObjects: DashboardObject[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onRefresh: () => void;
  onInspectObject: (object: DashboardObject) => void;
  bulkSelectedObjects: Set<string>;
  onToggleBulkSelection: (id: string) => void;
  onBulkDelete: () => void;
}

export function ObjectsRail({
  mobilePanel,
  loading,
  projects,
  activeAgents,
  workspaceFiles,
  dashboardObjects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onRefresh,
  onInspectObject,
  bulkSelectedObjects,
  onToggleBulkSelection,
  onBulkDelete,
}: ObjectsRailProps) {
  return (
    <aside
      className={`${mobilePanel === "objects" ? "flex" : "hidden"} xl:flex w-full xl:w-[320px] shrink-0 border-r-4 border-primary bg-background flex-col overflow-y-auto custom-scrollbar`}
    >
      <div className="p-5 border-b-4 border-primary bg-surface-container-high">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-headline font-black uppercase text-2xl text-primary tracking-tight">Objects</h1>
            <p className="font-body text-xs text-on-surface-variant font-semibold mt-1">
              Projects, files, messages, sub-agents, and supervisor context in one rail.
            </p>
          </div>
          <button
            onClick={onCreateProject}
            className="bg-primary text-on-primary rounded p-2 hover:bg-tertiary hover:text-on-tertiary"
            title="Create project"
            aria-label="Create project"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
          </button>
        </div>
      </div>

      <section className="p-4 border-b-4 border-primary">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-headline font-black uppercase text-xs text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">folder_managed</span>
            Projects
          </h2>
          <button onClick={onRefresh} className="text-primary hover:text-tertiary" title="Refresh" aria-label="Refresh projects">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">refresh</span>
          </button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="font-mono text-[10px] uppercase text-on-surface-variant p-4 border border-dashed border-outline-variant rounded">
              Loading project objects&hellip;
            </div>
          ) : projects.length === 0 ? (
            <button
              onClick={onCreateProject}
              className="w-full p-4 border-2 border-dashed border-outline-variant rounded text-left hover:bg-surface-container"
            >
              <span className="font-body text-xs font-semibold text-primary">Create the first project</span>
            </button>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`w-full text-left p-3 border-2 rounded transition-colors ${
                  selectedProjectId === project.id
                    ? "border-primary bg-primary-container"
                    : "border-outline-variant bg-surface hover:border-primary"
                }`}
              >
                <div className="flex justify-between gap-3">
                  <span className="font-body text-sm font-semibold truncate">{project.name}</span>
                  <span className="font-mono text-[9px] uppercase text-secondary">{project.status}</span>
                </div>
                <p className="font-body text-[10px] text-on-surface-variant line-clamp-2 mt-1">
                  {project.objective || "No objective yet."}
                </p>
                <div className="mt-2 h-2 bg-background border border-primary overflow-hidden rounded-sm">
                  <div
                    className="h-full bg-secondary"
                    style={{ width: `${project.readinessScore || 0}%` }}
                    aria-label={`Readiness ${project.readinessScore || 0}%`}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="p-4 border-b-4 border-primary">
        <h2 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">smart_toy</span>
          Sub-agents
        </h2>
        <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
          {activeAgents.length === 0 ? (
            <div className="bg-surface border border-dashed border-outline-variant rounded p-3 text-center">
              <span className="material-symbols-outlined text-on-surface-variant text-xl" aria-hidden="true">smart_toy</span>
              <p className="font-body text-[11px] text-on-surface-variant mt-1">No sub-agents yet.</p>
              <Link href="/agents" className="text-xs text-primary font-semibold hover:underline">
                Add an agent &rarr;
              </Link>
            </div>
          ) : (
            activeAgents.slice(0, 7).map((agent) => (
              <div key={agent.id} className="bg-surface border border-outline-variant p-2 rounded">
                <div className="flex justify-between gap-2">
                  <span className="font-body text-xs font-semibold truncate">{agent.name}</span>
                  <span className="font-mono text-[9px] uppercase text-on-surface-variant">{agent.status}</span>
                </div>
                <p className="font-body text-[10px] text-on-surface-variant truncate">
                  {agent.role} &middot; {agent.permissionTier}
                </p>
              </div>
            ))
          )}
        </div>
        <Link
          href="/agents"
          className="mt-3 flex items-center justify-center gap-1.5 bg-surface border border-outline-variant px-3 py-2 font-body text-xs font-semibold rounded hover:bg-primary hover:text-on-primary transition-colors"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">edit_square</span>
          Edit agent roster
        </Link>
      </section>

      <section className="p-4 border-b-4 border-primary">
        <h2 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">draft</span>
          Workspace files
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/library"
            className="bg-surface border border-outline-variant rounded p-3 hover:bg-primary hover:text-on-primary transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">folder_open</span>
            <span className="block font-body text-[10px] font-semibold mt-1">Upload / Edit</span>
          </Link>
          <Link
            href="/code"
            className="bg-surface border border-outline-variant rounded p-3 hover:bg-primary hover:text-on-primary transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">terminal</span>
            <span className="block font-body text-[10px] font-semibold mt-1">Run files</span>
          </Link>
        </div>
        <p className="font-mono text-[9px] uppercase text-on-surface-variant mt-3">
          {workspaceFiles.length} files in sandbox workspace
        </p>
      </section>

      <section className="p-4">
        <h2 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">inventory_2</span>
          All objects
        </h2>
        <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
          {dashboardObjects.length === 0 ? (
            <div className="bg-surface border border-dashed border-outline-variant rounded p-4 text-center">
              <span className="material-symbols-outlined text-on-surface-variant text-2xl" aria-hidden="true">inventory_2</span>
              <p className="font-body text-xs text-on-surface-variant mt-1">No projects, agents, or files yet.</p>
              <button
                onClick={onCreateProject}
                className="mt-2 text-xs text-primary font-semibold hover:underline"
              >
                Create your first project &rarr;
              </button>
            </div>
          ) : (
            dashboardObjects.map((object) => (
              <button
                key={`${object.type}-${object.id}`}
                onClick={() => onInspectObject(object)}
                className="w-full text-left bg-surface border border-outline-variant p-2 rounded hover:border-primary hover:bg-surface-container transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    {(object.type === 'project' || object.type === 'file') && (
                      <input
                        type="checkbox"
                        checked={bulkSelectedObjects.has(object.id)}
                        onChange={() => onToggleBulkSelection(object.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-primary"
                        aria-label={`Select ${object.title}`}
                      />
                    )}
                    <span className="font-body text-xs font-semibold truncate">{object.title}</span>
                  </div>
                  <span className="font-mono text-[9px] uppercase text-on-surface-variant">{object.type}</span>
                </div>
                <p className="font-body text-[10px] text-on-surface-variant truncate">
                  {object.owner} / {object.status}
                </p>
              </button>
            ))
          )}
        </div>
      </section>

      {bulkSelectedObjects.size > 0 && (
        <div className="sticky bottom-0 p-4 border-t-4 border-primary bg-primary-container z-10 shrink-0">
          <div className="flex justify-between items-center">
            <span className="font-headline font-black text-xs uppercase text-primary">
              {bulkSelectedObjects.size} Selected
            </span>
            <button
              onClick={onBulkDelete}
              className="bg-error text-on-error px-3 py-1.5 border-2 border-error hover:bg-error/90 transition-colors font-headline font-bold text-xs uppercase shadow-sm"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
