"use client";

import type { FormEvent, Ref } from "react";

export interface MemoryItemSummary {
  id: string;
  scope: string;
  key: string;
  value: string;
  reason: string;
  importance: "Low" | "Medium" | "High" | string;
  pinned: boolean;
  stale: boolean;
  createdAt: string;
}

export interface MemorySectionProps {
  ref: Ref<HTMLDivElement>;
  // Counts for the bank tiles.
  memoryItems: MemoryItemSummary[];
  // Modal state.
  showMemoryModal: boolean;
  activeMemoryBank: string;
  newKey: string;
  newValue: string;
  newImportance: string;
  memorySearch: string;
  showPinnedOnly: boolean;
  // The filtered list of memory items rendered in the modal.
  visibleMemoryItems: MemoryItemSummary[];
  // Setters.
  onOpenBank: (name: string) => void;
  onCloseModal: () => void;
  onChangeNewKey: (value: string) => void;
  onChangeNewValue: (value: string) => void;
  onChangeNewImportance: (value: string) => void;
  onChangeSearch: (value: string) => void;
  onTogglePinnedOnly: () => void;
  // Actions.
  onSubmitMemory: (e: FormEvent) => void;
  onPurgeBank: (name: string) => void;
  onPinItem: (id: string, pinned: boolean) => void;
  onReviewItem: (id: string) => void;
}

interface BankMeta {
  name: string;
  icon: string;
  type: "Persistent" | "Ephemeral";
  bg: string;
  border: string;
  danger?: boolean;
}

const BANK_META: BankMeta[] = [
  { name: "User", icon: "person", type: "Persistent", bg: "bg-primary-container", border: "border-l-secondary" },
  { name: "Workspace", icon: "folder_special", type: "Persistent", bg: "bg-tertiary-container", border: "border-l-tertiary" },
  { name: "Mission", icon: "radar", type: "Ephemeral", bg: "bg-surface-variant", border: "border-l-outline-variant", danger: true },
];

export function MemorySection(props: MemorySectionProps) {
  return (
    <>
      <div ref={props.ref} className="flex flex-col gap-6">
        <div className="border-b-4 border-primary pb-4 mb-4 flex justify-between items-end">
          <div>
            <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Memory Banks</h2>
            <p className="font-body text-on-surface-variant mt-2">Manage learned context across different retention layers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {BANK_META.map((m) => {
            const count = props.memoryItems.filter((item) => item.scope === m.name).length;
            return (
              <div key={m.name} className="neo-border bg-surface flex flex-col h-full relative group">
                <div className={`p-4 border-b-4 border-primary flex justify-between items-center ${m.bg}`}>
                  <h3 className="font-headline font-bold uppercase text-lg flex items-center gap-2">
                    <span className="material-symbols-outlined">{m.icon}</span> {m.name} Bank
                  </h3>
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase border-2 border-primary ${m.danger ? "bg-error text-on-error" : "bg-background"}`}>{m.type}</span>
                </div>
                <div className="p-4 flex-1 flex flex-col gap-3 font-body text-sm bg-background">
                  <p className="text-on-surface-variant text-xs uppercase font-bold tracking-wider mb-2">Stored Telemetry</p>
                  <div className={`p-3 border-l-4 ${m.border} bg-surface flex flex-col gap-1`}>
                    <span className="font-headline font-bold text-xs uppercase text-primary">Entries: {count}</span>
                    <span className="text-[10px] text-on-surface-variant">Contextual data managed by the {m.name} bank.</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 border-t-4 border-primary">
                  <button
                    onClick={() => props.onOpenBank(m.name)}
                    className="p-3 border-r-4 border-primary font-bold uppercase text-[10px] hover:bg-primary hover:text-on-primary transition-colors flex justify-center items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span> View Items
                  </button>
                  <button
                    onClick={() => props.onPurgeBank(m.name)}
                    className="p-3 font-bold uppercase text-[10px] text-error hover:bg-error hover:text-on-error transition-colors flex justify-center items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span> Purge Cache
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {props.showMemoryModal && <MemoryInspectorModal {...props} />}
    </>
  );
}

function MemoryInspectorModal(props: MemorySectionProps) {
  return (
    <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background neo-border max-w-2xl w-full max-h-[85vh] flex flex-col neo-shadow-lg">
        <div className="p-4 border-b-4 border-primary bg-primary-container flex justify-between items-center">
          <h3 className="font-headline font-black uppercase text-lg text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">database</span>
            Memory Inspector: {props.activeMemoryBank} Bank
          </h3>
          <button
            onClick={props.onCloseModal}
            className="w-8 h-8 neo-border bg-background flex items-center justify-center hover:bg-secondary hover:text-on-error transition-colors"
            aria-label="Close memory inspector"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          <form onSubmit={props.onSubmitMemory} className="neo-border bg-surface p-4 space-y-4">
            <h4 className="font-headline font-bold uppercase text-xs text-primary">Inject Custom Memory Entry</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Key / Domain</label>
                <input
                  type="text"
                  value={props.newKey}
                  onChange={(e) => props.onChangeNewKey(e.target.value)}
                  className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary"
                  placeholder="e.g. twitter_apiendpoint"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Importance</label>
                <select
                  value={props.newImportance}
                  onChange={(e) => props.onChangeNewImportance(e.target.value)}
                  className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-bold"
                >
                  <option value="Low">Low Importance</option>
                  <option value="Medium">Medium Importance</option>
                  <option value="High">High Importance</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Value / Fact Content</label>
              <textarea
                value={props.newValue}
                onChange={(e) => props.onChangeNewValue(e.target.value)}
                className="w-full bg-background neo-border p-2 text-xs h-16 focus:outline-none focus:border-tertiary font-mono"
                placeholder="e.g. Ensure all telemetry events include workspace correlation headers."
                required
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs hover:bg-tertiary hover:text-on-tertiary transition-colors"
              >
                Inject Memory
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <h4 className="font-headline font-bold uppercase text-xs text-primary flex justify-between items-center">
              <span>Learned Fact Contexts</span>
              <button
                onClick={() => props.onPurgeBank(props.activeMemoryBank)}
                className="text-error hover:underline text-[10px] uppercase font-bold"
              >
                Purge All
              </button>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <input
                value={props.memorySearch}
                onChange={(e) => props.onChangeSearch(e.target.value)}
                className="bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
                placeholder="Search memory, reason, or value"
              />
              <button
                type="button"
                onClick={props.onTogglePinnedOnly}
                className={`neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] ${props.showPinnedOnly ? "bg-tertiary text-on-tertiary" : "bg-background"}`}
              >
                Pinned
              </button>
            </div>
            {props.visibleMemoryItems.length === 0 ? (
              <div className="p-8 text-center bg-surface-container neo-border text-on-surface-variant text-xs">
                No memories persisted in the {props.activeMemoryBank} bank. Use the form above to inject a custom fact.
              </div>
            ) : (
              <div className="space-y-2">
                {props.visibleMemoryItems.map((item) => (
                  <div key={item.id} className="neo-border bg-surface p-3 text-xs relative">
                    <span className={`absolute top-2 right-2 text-[8px] font-bold uppercase px-1.5 py-0.5 border ${
                      item.importance === "High" ? "bg-secondary text-on-error border-secondary" : "bg-surface-container text-on-surface-variant"
                    }`}>
                      {item.pinned ? "Pinned" : item.importance}
                    </span>
                    <span className="font-bold uppercase text-primary block truncate max-w-[80%]">{item.key}</span>
                    <p className="font-mono text-on-surface-variant mt-1.5 bg-background p-2 neo-border leading-relaxed break-words">{item.value}</p>
                    <p className="font-body text-[10px] text-on-surface-variant mt-2">{item.reason}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => props.onPinItem(item.id, !item.pinned)}
                        className="border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
                      >
                        {item.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onReviewItem(item.id)}
                        className="border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
                      >
                        Review
                      </button>
                      {item.stale && <span className="border border-secondary px-2 py-1 font-mono text-[9px] uppercase text-secondary">Stale</span>}
                    </div>
                    <span className="text-[9px] text-outline mt-2 block">Persisted at: {new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t-4 border-primary bg-surface-container-high flex justify-end">
          <button
            onClick={props.onCloseModal}
            className="bg-primary text-on-primary neo-border px-6 py-2 font-headline font-bold uppercase text-xs"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
