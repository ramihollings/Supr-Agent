"use client";

import type { Ref } from "react";

export interface PermissionsSectionProps {
  ref: Ref<HTMLDivElement>;
  /** Currently enforced permission tier id: observe | governed | execute | root. */
  permissionBoundary: string;
  onEnforceTier: (id: string) => void;
  /** Docker sandbox probe state. */
  dockerAvailable: boolean;
  dockerLastProbe: string | null;
  onDockerProbe: () => void;
  /** Remote execution settings. */
  remoteExecutionEnabled: boolean;
  remoteExecutionHost: string;
  onSetRemoteExecutionEnabled: (value: boolean) => void;
  onSetRemoteExecutionHost: (value: string) => void;
  onUpdateSetting: (key: string, value: string, toastMsg?: string) => void | Promise<void>;
}

const PERMISSION_TIERS: Array<{
  id: string;
  level: number;
  name: string;
  desc: string;
  danger?: boolean;
}> = [
  { id: 'observe', level: 1, name: 'Observe', desc: 'Read-only access to logs and state.' },
  { id: 'governed', level: 2, name: 'Governed', desc: 'Can trigger predefined workflows, require review for executions.' },
  { id: 'execute', level: 3, name: 'Execute', desc: 'Modify agent parameters, compile packages, direct execute.' },
  { id: 'root', level: 4, name: 'Root', desc: 'Unrestricted clearance. Destructive capability across hosts.', danger: true },
];

export function PermissionsSection({
  ref,
  permissionBoundary,
  onEnforceTier,
  dockerAvailable,
  dockerLastProbe,
  onDockerProbe,
  remoteExecutionEnabled,
  remoteExecutionHost,
  onSetRemoteExecutionEnabled,
  onSetRemoteExecutionHost,
  onUpdateSetting,
}: PermissionsSectionProps) {
  return (
    <div ref={ref} className="flex flex-col gap-6">
      <div className="border-b-4 border-primary pb-4 mb-4">
        <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Permissions Hierarchy</h2>
        <p className="font-body text-on-surface-variant mt-2">Adjust clearance limits and agent boundaries.</p>
      </div>

      <div className="flex flex-col neo-border bg-surface-container-low">
        {PERMISSION_TIERS.map((p) => (
          <div key={p.id} className={`flex items-center p-4 border-b-4 border-primary ${
            permissionBoundary === p.id
              ? p.danger ? 'bg-secondary text-on-error' : 'bg-primary-container text-on-primary-container'
              : 'bg-surface'
          }`}>
            <div className={`w-12 h-12 neo-border flex items-center justify-center mr-4 font-black ${p.danger ? 'bg-secondary text-on-error' : 'bg-surface-container'}`}>{p.level}</div>
            <div className="flex-1">
              <h4 className="font-bold uppercase flex items-center gap-1.5">
                {p.name}
                {permissionBoundary === p.id && <span className="material-symbols-outlined text-xs">verified</span>}
              </h4>
              <p className="text-sm font-body">{p.desc}</p>
            </div>
            <button
              onClick={() => onEnforceTier(p.id)}
              className={`px-4 py-2 neo-border font-bold text-sm uppercase transition-colors ${
                permissionBoundary === p.id
                  ? 'bg-primary text-on-primary'
                  : 'bg-background hover:bg-surface-container'
              }`}
            >
              {permissionBoundary === p.id ? 'Active Boundary' : 'Enforce'}
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 border-b-2 border-primary pb-3">
            <div>
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">deployed_code</span> Docker Sandbox
              </h3>
              <p className="font-body text-xs text-on-surface-variant mt-1">Controls whether `execute_sandboxed_command` can run in a real Docker environment.</p>
            </div>
            <span className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary ${dockerAvailable ? 'bg-primary text-on-primary' : 'bg-surface-dim text-on-surface-variant'}`}>
              {dockerAvailable ? 'Available' : 'Not Enabled'}
            </span>
          </div>
          <div className="font-mono text-[10px] text-on-surface-variant">
            Last probe: {dockerLastProbe ? new Date(dockerLastProbe).toLocaleString() : 'never'}
          </div>
          <button
            onClick={onDockerProbe}
            className="bg-primary text-on-primary font-bold uppercase text-xs p-3 neo-border hover:bg-tertiary hover:text-on-tertiary transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">fact_check</span>
            Probe Docker
          </button>
        </div>

        <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 border-b-2 border-primary pb-3">
            <div>
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">dns</span> Remote Execution
              </h3>
              <p className="font-body text-xs text-on-surface-variant mt-1">Disabled by default. `execute_remote` remains blocked unless a host is configured and this switch is enabled.</p>
            </div>
            <button
              onClick={() => onSetRemoteExecutionEnabled(!remoteExecutionEnabled)}
              className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary transition-all ${remoteExecutionEnabled ? 'bg-secondary text-on-error neo-shadow' : 'bg-surface-dim text-on-surface-variant'}`}
            >
              {remoteExecutionEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <div>
            <label className="block font-headline font-bold uppercase text-primary mb-2 text-xs">Remote Host Reference</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={remoteExecutionHost}
                onChange={(event) => onSetRemoteExecutionHost(event.target.value)}
                className="flex-1 bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                placeholder="ssh://host-alias or disabled"
              />
              <button
                onClick={() => onUpdateSetting('remote_execution_host', remoteExecutionHost, 'Remote host reference saved')}
                className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
