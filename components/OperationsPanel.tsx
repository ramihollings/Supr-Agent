"use client";

import Link from "next/link";
import { RuntimeConsoleStrip } from "@/components/RuntimeConsoleStrip";

export interface OperationsPanelAgent {
  id: string;
  name: string;
  role: string;
  permissionTier: string;
  status: string;
  currentProject: string | null;
}

export interface OperationsPanelApproval {
  id: string;
  action: string;
  reason: string;
  riskLevel: string;
  status: string;
}

export interface OperationsPanelConnector {
  id: string;
  name: string;
  status: string;
  configured: boolean;
}

export interface OperationsPanelRunbook {
  id: string;
  name: string;
  description: string;
}

export interface OperationsPanelProps {
  mobilePanel: string;
  agents: OperationsPanelAgent[];
  approvals: OperationsPanelApproval[];
  connectors: OperationsPanelConnector[];
  runbooks: OperationsPanelRunbook[];
  metrics: unknown[];
  supervisorGroups: { id: string }[];
  blueprintCount: number;
  selectedProjectId: string | null;
  onApprovalDecision: (id: string, decision: "approved" | "rejected" | "revised") => void;
  onStartRunbook: (id: string) => void;
  onForceRecycle: (agent: OperationsPanelAgent) => void;
}

export function OperationsPanel({
  mobilePanel,
  agents,
  approvals,
  connectors,
  runbooks,
  metrics,
  supervisorGroups,
  blueprintCount,
  selectedProjectId,
  onApprovalDecision,
  onStartRunbook,
  onForceRecycle,
}: OperationsPanelProps) {
  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  return (
    <aside
      className={`${mobilePanel === "ops" ? "flex" : "hidden"} xl:flex w-full xl:w-[340px] shrink-0 bg-background flex-col overflow-y-auto custom-scrollbar`}
    >
      <section className="p-5 border-b-4 border-primary bg-surface-container-high">
        <h2 className="font-headline font-black uppercase text-xl text-primary tracking-tight flex items-center gap-2">
          <span className="material-symbols-outlined" aria-hidden="true">tune</span>
          Operations
        </h2>
        <p className="font-body text-xs text-on-surface-variant font-semibold mt-1">
          The governing agent&rsquo;s control surface: approvals, groups, providers, and object actions.
        </p>
      </section>

      <section className="p-4 border-b-4 border-primary">
        <RuntimeConsoleStrip
          agents={agents as any}
          approvals={approvals as any}
          metrics={metrics as any}
          onForceRecycle={(agent) => onForceRecycle(agent as OperationsPanelAgent)}
        />
      </section>

      <section className="p-4 border-b-4 border-primary">
        <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">approval_delegation</span>
          Approval queue
        </h3>
        <div className="space-y-2">
          {pendingApprovals.slice(0, 4).map((approval) => (
            <div key={approval.id} className="bg-surface border border-outline-variant rounded p-3">
              <div className="flex justify-between gap-2">
                <span className="font-body text-xs font-semibold truncate">{approval.action}</span>
                <span className="font-mono text-[9px] uppercase text-secondary">{approval.riskLevel}</span>
              </div>
              <p className="font-body text-[10px] text-on-surface-variant line-clamp-2 mt-1">{approval.reason}</p>
              <div className="grid grid-cols-3 gap-1 mt-3" role="group" aria-label="Approval decision">
                {(["approved", "rejected", "revised"] as const).map((decision) => (
                  <button
                    key={decision}
                    onClick={() => onApprovalDecision(approval.id, decision)}
                    className="border border-outline-variant rounded px-1 py-1 font-body text-[10px] hover:bg-primary hover:text-on-primary"
                  >
                    {decision}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {pendingApprovals.length === 0 && (
            <p className="font-body text-xs text-on-surface-variant">No pending approvals.</p>
          )}
        </div>
      </section>

      <section className="p-4 border-b-4 border-primary">
        <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">groups</span>
          Supervisor teams
        </h3>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-surface border border-outline-variant rounded p-3">
            <span className="font-headline font-black text-2xl text-secondary">{supervisorGroups.length}</span>
            <p className="font-body text-[10px] text-on-surface-variant font-semibold uppercase">Agent groups</p>
          </div>
          <div className="bg-surface border border-outline-variant rounded p-3">
            <span className="font-headline font-black text-2xl text-tertiary">{blueprintCount}</span>
            <p className="font-body text-[10px] text-on-surface-variant font-semibold uppercase">Blueprints</p>
          </div>
        </div>
        <Link
          href={`/supervisor${selectedProjectId ? `?id=${selectedProjectId}` : ""}`}
          className="flex items-center justify-center gap-1.5 bg-primary text-on-primary rounded px-3 py-2 font-body text-xs font-semibold hover:bg-tertiary hover:text-on-tertiary"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">admin_panel_settings</span>
          Open supervisor console
        </Link>
      </section>

      <section className="p-4 border-b-4 border-primary">
        <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">conversion_path</span>
          Runbooks
        </h3>
        <div className="space-y-2">
          {runbooks.slice(0, 4).map((runbook) => (
            <div key={runbook.id} className="bg-surface border border-outline-variant rounded p-3">
              <span className="font-body text-xs font-semibold block">{runbook.name}</span>
              <p className="font-body text-[10px] text-on-surface-variant line-clamp-2 mt-1">{runbook.description}</p>
              <button
                onClick={() => onStartRunbook(runbook.id)}
                className="mt-2 w-full bg-background border border-outline-variant rounded px-2 py-1 font-body text-[10px] hover:bg-primary hover:text-on-primary"
              >
                Start
              </button>
            </div>
          ))}
          {runbooks.length === 0 && (
            <p className="font-body text-xs text-on-surface-variant">No runbooks available.</p>
          )}
        </div>
      </section>

      <section className="p-4">
        <h3 className="font-headline font-black uppercase text-xs text-primary mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">settings_input_component</span>
          Providers
        </h3>
        <div className="space-y-2">
          {connectors.map((connector) => (
            <div
              key={connector.id}
              className="flex items-center justify-between bg-surface border border-outline-variant rounded p-2"
            >
              <span className="font-body text-xs font-semibold truncate">{connector.name}</span>
              <span
                className={`font-mono text-[9px] uppercase ${
                  connector.configured ? "text-tertiary" : "text-on-surface-variant"
                }`}
              >
                {connector.status}
              </span>
            </div>
          ))}
        </div>
        <Link
          href="/settings"
          className="mt-3 flex items-center justify-center gap-1.5 bg-background border border-outline-variant rounded px-3 py-2 font-body text-xs font-semibold hover:bg-primary hover:text-on-primary"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">settings</span>
          Configure
        </Link>
      </section>
    </aside>
  );
}
