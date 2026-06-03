"use client";

import type { Ref } from "react";

interface StandardsSectionProps {
  ref: Ref<HTMLDivElement>;
  onUpdateSetting: (key: string, value: string, toastMsg?: string) => void | Promise<void>;
}

const STANDARDS = [
  { id: "cite_evidence", name: "Evidence Required", desc: "Agents must cite sources before execution." },
  { id: "pass_tests", name: "Tests Must Pass", desc: "Validation must succeed before deployment." },
  { id: "scope_approval", name: "Scope Approval", desc: "Require human sign-off if mission parameters shift." },
] as const;

export function StandardsSection({ ref, onUpdateSetting }: StandardsSectionProps) {
  return (
    <div ref={ref} className="flex flex-col gap-6">
      <div className="border-b-4 border-primary pb-4 mb-4">
        <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Operational Standards</h2>
        <p className="font-body text-on-surface-variant mt-2">Fine-tune verification rules applied to all active deployments.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {STANDARDS.map((s) => (
          <label key={s.id} className="flex items-start gap-4 p-4 border-4 border-primary bg-surface cursor-pointer group hover:bg-surface-container transition-colors">
            <input
              type="checkbox"
              defaultChecked
              onChange={(e) => {
                onUpdateSetting(`standard_${s.id}`, e.target.checked ? "true" : "false", `${s.name} rule updated ✓`);
              }}
              className="w-6 h-6 border-2 border-primary rounded-none text-primary focus:ring-primary focus:ring-offset-0 mt-1"
            />
            <div>
              <span className="block font-bold uppercase text-sm mb-1 group-hover:text-tertiary transition-colors">{s.name}</span>
              <span className="block font-body text-xs text-on-surface-variant">{s.desc}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
