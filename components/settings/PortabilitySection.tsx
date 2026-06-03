"use client";

import type { ChangeEvent, Ref } from "react";

export type ImportStatus = "idle" | "reading" | "ready" | "importing";

export interface ImportBundle {
  version: string;
  timestamp: string;
  data?: {
    missions?: unknown[];
    glidepaths?: unknown[];
    agents?: unknown[];
    tasks?: unknown[];
    approvals?: unknown[];
    memoryItems?: unknown[];
    settings?: unknown[];
  };
}

export interface ImportCollision {
  table: string;
  count: number;
  examples: string[];
}

export interface PortabilitySectionProps {
  ref: Ref<HTMLDivElement>;
  // Export side.
  lastBackupAt: string | null;
  isBackingUp: boolean;
  onExport: () => void;
  // Import side.
  importStatus: ImportStatus;
  importBundle: ImportBundle | null;
  collisions: ImportCollision[];
  confirmOverwrite: boolean;
  importSummary: any;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onExecuteImport: () => void;
  onCancelImport: () => void;
  onClearSummary: () => void;
  onConfirmOverwriteChange: (checked: boolean) => void;
}

export function PortabilitySection({
  ref,
  lastBackupAt,
  isBackingUp,
  onExport,
  importStatus,
  importBundle,
  collisions,
  confirmOverwrite,
  importSummary,
  onFileSelect,
  onExecuteImport,
  onCancelImport,
  onClearSummary,
  onConfirmOverwriteChange,
}: PortabilitySectionProps) {
  return (
    <div ref={ref} className="flex flex-col gap-6">
      <div className="border-b-4 border-primary pb-4 mb-4">
        <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Organization Portability</h2>
        <p className="font-body text-on-surface-variant mt-2">Export a scrubbed JSON bundle of your entire organization (projects, agents, memories) or restore database state from a backup.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Panel */}
        <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
          <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2 mb-2">
            <span className="material-symbols-outlined text-primary">download</span> Back up workspace
          </h3>
          <p className="font-body text-xs text-on-surface-variant leading-relaxed">
            Download a complete JSON snapshot of your workspace database. API keys, passwords, and tokens are scrubbed to <code className="font-mono text-[10px]">[SCRUBBED]</code> before the file is generated.
          </p>
          {lastBackupAt && (
            <p className="font-mono text-[10px] text-on-surface-variant mt-2">
              Last backup: {new Date(lastBackupAt).toLocaleString()}
            </p>
          )}
          <button
            onClick={onExport}
            disabled={isBackingUp}
            aria-busy={isBackingUp}
            className="mt-auto bg-primary text-on-primary font-bold uppercase text-xs p-4 neo-border hover:bg-tertiary hover:text-on-tertiary hover:neo-shadow transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {isBackingUp ? "hourglass_top" : "download"}
            </span>
            {isBackingUp ? "Generating backup\u2026" : "Back up now"}
          </button>
        </div>

        {/* Import Panel */}
        <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
          <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2 mb-2">
            <span className="material-symbols-outlined text-primary">upload</span> Import / Restore Backup
          </h3>
          <p className="font-body text-xs text-on-surface-variant leading-relaxed mb-2">
            Restore organization state from a previously exported database JSON bundle. This will overlay imported records onto your existing SQLite database.
          </p>

          {importStatus === "idle" && (
            <div className="relative border-2 border-dashed border-primary bg-background p-4 flex flex-col items-center justify-center min-h-[100px] cursor-pointer hover:bg-surface-container transition-colors">
              <input
                type="file"
                accept=".json"
                onChange={onFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="material-symbols-outlined text-3xl text-primary mb-2">cloud_upload</span>
              <span className="font-headline font-bold text-xs uppercase text-primary">Choose JSON Backup File</span>
            </div>
          )}

          {importStatus === "reading" && (
            <div className="border-2 border-primary bg-background p-4 flex items-center justify-center min-h-[100px] gap-2">
              <span className="material-symbols-outlined animate-spin text-primary">sync</span>
              <span className="font-headline font-bold text-xs uppercase text-primary">Parsing file structure...</span>
            </div>
          )}

          {importStatus === "ready" && importBundle && (
            <div className="space-y-4">
              {/* Manifest Preview */}
              <div className="bg-background border-2 border-primary p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-primary/20 pb-1">
                  <span className="font-headline font-bold uppercase text-primary">Bundle Version</span>
                  <span className="font-mono">{importBundle.version}</span>
                </div>
                <div className="flex justify-between items-center border-b border-primary/20 pb-1">
                  <span className="font-headline font-bold uppercase text-primary">Timestamp</span>
                  <span className="font-mono text-[10px]">{new Date(importBundle.timestamp).toLocaleString()}</span>
                </div>
                <div className="pt-1">
                  <span className="font-headline font-bold uppercase text-xs text-primary block mb-1">Entity Breakdown</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                    <div>Missions: {importBundle.data?.missions?.length || 0}</div>
                    <div>Glidepaths: {importBundle.data?.glidepaths?.length || 0}</div>
                    <div>Agents: {importBundle.data?.agents?.length || 0}</div>
                    <div>Tasks: {importBundle.data?.tasks?.length || 0}</div>
                    <div>Approvals: {importBundle.data?.approvals?.length || 0}</div>
                    <div>Memories: {importBundle.data?.memoryItems?.length || 0}</div>
                    <div>Settings: {importBundle.data?.settings?.length || 0}</div>
                  </div>
                </div>
              </div>

              {/* Collision Alert Panel */}
              {collisions.length > 0 && (
                <div className="bg-secondary/15 border-4 border-secondary p-4 flex flex-col gap-2">
                  <h4 className="font-headline font-bold uppercase text-xs text-secondary flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">warning</span> Collision Overwrite Danger
                  </h4>
                  <p className="text-[10px] leading-relaxed text-on-surface-variant font-body">
                    This backup contains entities with IDs matching items in your current workspace. Proceeding will overwrite existing configurations:
                  </p>
                  <div className="space-y-1 font-mono text-[9px] text-on-surface-variant bg-background p-2 border border-secondary">
                    {collisions.map((c) => (
                      <div key={c.table}>
                        <strong>{c.table}:</strong> {c.count} match(es) (e.g. {c.examples.join(", ")})
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmOverwrite}
                      onChange={(e) => onConfirmOverwriteChange(e.target.checked)}
                      className="w-4 h-4 border-2 border-secondary rounded-none focus:ring-0 text-secondary"
                    />
                    <span className="font-headline font-bold uppercase text-[9px] text-secondary">
                      I authorize overwriting existing records
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={onExecuteImport}
                  disabled={collisions.length > 0 && !confirmOverwrite}
                  className={`flex-1 font-headline font-bold uppercase text-xs p-3 neo-border hover:neo-shadow transition-all flex items-center justify-center gap-2 ${
                    collisions.length > 0 && !confirmOverwrite
                      ? "bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed border-outline"
                      : "bg-primary text-on-primary hover:bg-tertiary hover:text-on-tertiary"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">restore</span>
                  Execute Restore
                </button>
                <button
                  onClick={onCancelImport}
                  className="bg-background text-primary font-headline font-bold uppercase text-xs p-3 neo-border hover:bg-surface-container transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {importStatus === "importing" && (
            <div className="border-2 border-primary bg-background p-4 flex flex-col items-center justify-center min-h-[100px] gap-2">
              <span className="material-symbols-outlined animate-spin text-3xl text-primary mb-2">sync</span>
              <span className="font-headline font-bold text-xs uppercase text-primary">Restoring database state...</span>
            </div>
          )}

          {/* Summary Panel */}
          {importSummary && (
            <div className="bg-primary/10 border-2 border-primary p-3 text-xs space-y-2">
              <h4 className="font-headline font-bold uppercase text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">verified</span> Restore Completed
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                <div>Missions: {importSummary.Missions || 0}</div>
                <div>Glidepaths: {importSummary.Glidepaths || 0}</div>
                <div>Agents: {importSummary.Agents || 0}</div>
                <div>Tasks: {importSummary.Tasks || 0}</div>
                <div>Approvals: {importSummary.Approvals || 0}</div>
                <div>Memories: {importSummary.Memory_Items || 0}</div>
                <div>Settings: {importSummary.Settings || 0}</div>
              </div>
              <button
                onClick={onClearSummary}
                className="w-full mt-2 bg-background border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
              >
                Clear Summary
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
