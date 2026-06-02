"use client";

import { useMemo, useRef, useState } from 'react';
import type { DashboardObject, ObjectAction, RunEvent } from '@/types';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';

const actionStyles: Record<NonNullable<ObjectAction['risk']>, string> = {
  low: 'bg-background text-primary hover:bg-surface-container',
  medium: 'bg-secondary text-on-secondary hover:bg-tertiary hover:text-on-tertiary',
  high: 'bg-error text-on-error hover:bg-primary',
};

type DashboardObjectDrawerProps = {
  object: DashboardObject | null;
  timeline?: RunEvent[];
  onClose: () => void;
  onAction?: (action: ObjectAction, object: DashboardObject) => void;
};

export function DashboardObjectDrawer({ object, timeline = [], onClose, onAction }: DashboardObjectDrawerProps) {
  const [confirmAction, setConfirmAction] = useState<ObjectAction | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, true, onClose);

  // Filter timeline events that act as evidence for this specific object
  const linkedEvidence = useMemo(() => {
    if (!object) return [];
    if (object.type === 'project') return timeline.slice(0, 5); // Show latest 5 project events
    if (object.type === 'sub-agent') {
      return timeline.filter(e => e.actor.toLowerCase().includes(object.title.toLowerCase()) || e.actor.toLowerCase().includes(object.id.toLowerCase())).slice(0, 5);
    }
    if (object.type === 'file') {
      return timeline.filter(e => e.title.includes(object.id) || e.detail.includes(object.id)).slice(0, 5);
    }
    return [];
  }, [object, timeline]);

  if (!object) return null;

  const handleActionClick = (action: ObjectAction) => {
    // Check if the action is destructive/high-risk
    if (action.risk === 'high' || action.id === 'delete' || action.id === 'archive') {
      setConfirmAction(action);
    } else {
      onAction?.(action, object);
    }
  };

  const handleConfirm = () => {
    if (confirmAction) {
      onAction?.(confirmAction, object);
      setConfirmAction(null);
    }
  };

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="object-drawer-title"
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l-4 border-primary shadow-[-6px_0_0_0_var(--color-primary)] flex flex-col"
    >
      <header className="p-4 border-b-4 border-primary bg-surface-container-high flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase text-on-surface-variant">{object.type} / {object.status}</p>
          <h2 id="object-drawer-title" className="font-headline font-black uppercase text-xl text-primary truncate">{object.title}</h2>
          <p className="font-body text-xs text-on-surface-variant mt-1 line-clamp-2">{object.description || 'No description recorded.'}</p>
        </div>
        <button
          onClick={onClose}
          className="neo-border bg-background text-primary p-2 hover:bg-primary hover:text-on-primary"
          title="Close inspector"
          aria-label="Close inspector"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Ownership and Provenance */}
        <section className="neo-border bg-surface p-3">
          <h3 className="font-headline font-black uppercase text-xs text-primary mb-3">Ownership</h3>
          <dl className="grid grid-cols-2 gap-3 font-mono text-[10px] uppercase">
            <div>
              <dt className="text-on-surface-variant">Owner</dt>
              <dd className="font-bold text-primary truncate">{object.owner}</dd>
            </div>
            <div>
              <dt className="text-on-surface-variant">Evidence Count</dt>
              <dd className="font-bold text-secondary">{object.evidenceCount || linkedEvidence.length || 0}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-on-surface-variant">Provenance</dt>
              <dd className="font-bold text-primary truncate">{object.provenance || 'Supr runtime'}</dd>
            </div>
            {object.updatedAt && (
              <div className="col-span-2">
                <dt className="text-on-surface-variant">Updated</dt>
                <dd className="font-bold text-primary">{new Date(object.updatedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Metadata */}
        {object.metadata && Object.keys(object.metadata).length > 0 && (
          <section className="neo-border bg-surface p-3">
            <h3 className="font-headline font-black uppercase text-xs text-primary mb-3">Metadata</h3>
            <div className="space-y-2">
              {Object.entries(object.metadata).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 border-b border-outline-variant pb-1 last:border-b-0">
                  <span className="font-headline font-bold uppercase text-[10px] text-on-surface-variant">{key}</span>
                  <span className="font-mono text-[10px] text-primary text-right truncate">{String(value ?? 'none')}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Linked Evidence Section */}
        <section className="neo-border bg-surface p-3">
          <h3 className="font-headline font-black uppercase text-xs text-primary mb-3">Linked Evidence Traces</h3>
          {linkedEvidence.length === 0 ? (
            <p className="font-body text-[10px] text-on-surface-variant italic">No execution evidence or logs found for this object.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {linkedEvidence.map((e) => (
                <div key={e.id} className="p-2 border border-primary/20 bg-background text-[10px] font-mono">
                  <div className="flex justify-between gap-2 text-primary font-bold">
                    <span className="truncate">{e.title}</span>
                    <span className="uppercase text-[8px] text-on-surface-variant">{e.status}</span>
                  </div>
                  <p className="font-body text-[9px] text-on-surface-variant mt-1 line-clamp-2">{e.detail}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Actions & Confirmation Overlay */}
        <section className="neo-border bg-surface p-3">
          <h3 className="font-headline font-black uppercase text-xs text-primary mb-3">Actions</h3>
          {confirmAction ? (
            <div className="border-4 border-error p-3 bg-background animate-fadeIn">
              <p className="font-headline font-bold text-xs uppercase text-error text-center mb-3">
                Confirm {confirmAction.label} on this {object.type}?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleConfirm}
                  className="bg-error text-on-error border-2 border-primary py-2 px-3 font-headline font-bold uppercase text-[10px] hover:bg-primary transition-colors"
                >
                  Yes, Confirm
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="bg-background text-primary border-2 border-primary py-2 px-3 font-headline font-bold uppercase text-[10px] hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {object.actions.map((item) => (
                <button
                  key={item.id}
                  disabled={!item.enabled}
                  onClick={() => handleActionClick(item)}
                  title={item.reason || item.label}
                  className={`border-2 border-primary px-3 py-2 font-headline font-bold uppercase text-[10px] flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed ${actionStyles[item.risk || 'low']}`}
                >
                  <span className="material-symbols-outlined text-sm">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
