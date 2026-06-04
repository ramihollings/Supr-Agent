"use client";

import { useEffect, useState } from 'react';

interface CompactionConfig {
  threshold: number;
  window: number;
  maxSummaryTokens: number;
}

export function CompactionPanel() {
  const [cfg, setCfg] = useState<CompactionConfig | null>(null);
  const [draft, setDraft] = useState<CompactionConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/context/compaction')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setCfg(data.config);
          setDraft(data.config);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch('/api/context/compaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_config', config: draft }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setCfg(data.config);
      setOk(`Saved. Threshold=${data.config.threshold}, window=${data.config.window}, maxSummaryTokens=${data.config.maxSummaryTokens}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!cfg || !draft) return <p className="font-body text-sm">Loading compaction config...</p>;

  return (
    <div className="space-y-3">
      <p className="font-body text-xs text-on-surface-variant">
        Compaction summarizes old Event_Log rows into a single Memory_Item so the agent&apos;s live context
        stays bounded. When the uncompacted event count for a mission crosses the threshold, a compaction
        pass runs and the LLM produces a summary of the most recent <em>window</em> events.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="font-headline text-[10px] font-bold uppercase">Threshold (events)</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={draft.threshold}
            onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })}
            className="w-full bg-background neo-border p-2 font-mono text-xs"
          />
        </label>
        <label className="block">
          <span className="font-headline text-[10px] font-bold uppercase">Window (events per pass)</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={draft.window}
            onChange={(e) => setDraft({ ...draft, window: Number(e.target.value) })}
            className="w-full bg-background neo-border p-2 font-mono text-xs"
          />
        </label>
        <label className="block">
          <span className="font-headline text-[10px] font-bold uppercase">Max summary tokens</span>
          <input
            type="number"
            min={50}
            max={4000}
            value={draft.maxSummaryTokens}
            onChange={(e) => setDraft({ ...draft, maxSummaryTokens: Number(e.target.value) })}
            className="w-full bg-background neo-border p-2 font-mono text-xs"
          />
        </label>
      </div>
      <div className="flex gap-2 items-center">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-on-primary font-bold uppercase text-xs px-4 py-2 neo-border hover:bg-tertiary transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Config'}
        </button>
        {ok && <span className="font-body text-xs text-tertiary">{ok}</span>}
        {error && <span className="font-body text-xs text-error">{error}</span>}
      </div>
    </div>
  );
}
