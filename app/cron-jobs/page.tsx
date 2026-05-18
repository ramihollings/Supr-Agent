"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect } from 'react';
import { fetchCronJobsState, toggleCronJobAction, triggerCronJobAction } from '@/app/actions';

interface CronJob {
  id: string;
  name: string;
  interval: string;
  targetAction: string;
  lastRun: string | null;
  status: string;
}

export default function CronJobsPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCrons = async () => {
    setIsLoading(true);
    const data = await fetchCronJobsState();
    if (data) setCrons(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadCrons();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleToggle = async (id: string, currentStatus: string, name: string) => {
    const res = await toggleCronJobAction(id, currentStatus);
    if (res.success) {
      showToast(`Automation "${name}" ${res.newStatus === 'Active' ? 'Resumed ✓' : 'Paused ⏸'}`);
      loadCrons();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  const handleTrigger = async (id: string, name: string) => {
    showToast(`Executing scheduled job "${name}" immediately...`);
    const res = await triggerCronJobAction(id);
    if (res.success) {
      showToast(`"${name}" executed successfully! ✓`);
      loadCrons();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Scheduled Automations" />

      {toastMessage && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-tighter text-primary">Cron Triggers</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant max-w-2xl border-l-4 border-secondary pl-4">
              Monitor, schedule, and execute recursive background tasks. Bounded sub-agents execute automated telemetry aggregation on fixed intervals.
            </p>
          </div>
        </header>

        {isLoading ? (
          <div className="font-mono text-primary text-lg uppercase font-bold animate-pulse">Connecting to Cron Daemon...</div>
        ) : (
          <div className="flex flex-col gap-6">
            {crons.map(job => (
              <article 
                key={job.id} 
                className={`neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col md:flex-row md:items-center justify-between p-6 gap-6 relative overflow-hidden transition-all ${
                  job.status === 'Paused' ? 'opacity-85 bg-surface-variant-dim' : ''
                }`}
              >
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="material-symbols-outlined text-3xl text-primary font-black">schedule</span>
                    <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">{job.name}</h3>
                    <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 border-2 border-primary ${
                      job.status === 'Active' ? 'bg-primary text-on-primary' : 'bg-surface-dim text-on-surface-variant'
                    }`}>
                      {job.status}
                    </span>
                    <span className="bg-surface border-2 border-primary px-2 py-0.5 font-mono text-[10px] text-primary flex items-center gap-1 font-bold">
                      <span className="material-symbols-outlined text-xs">loop</span> {job.interval}
                    </span>
                  </div>

                  <p className="font-body text-sm text-on-surface-variant border-l-4 border-primary pl-3 mt-1">
                    {job.targetAction}
                  </p>

                  <div className="flex items-center gap-1.5 mt-2 font-mono text-xs text-primary">
                    <span className="material-symbols-outlined text-sm">history</span>
                    <span>Last Run: </span>
                    <span className="font-bold">
                      {job.lastRun ? new Date(job.lastRun).toLocaleString() : 'Never Executed'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 shrink-0 flex-wrap">
                  <button 
                    onClick={() => handleToggle(job.id, job.status, job.name)}
                    className={`px-5 py-3 font-headline font-bold uppercase text-xs neo-border neo-shadow hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-2 ${
                      job.status === 'Active' ? 'bg-background text-primary hover:bg-surface-container' : 'bg-primary text-on-primary hover:bg-tertiary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{job.status === 'Active' ? 'pause_circle' : 'play_circle'}</span>
                    <span>{job.status === 'Active' ? 'Pause Trigger' : 'Resume Trigger'}</span>
                  </button>
                  
                  <button 
                    onClick={() => handleTrigger(job.id, job.name)}
                    className="bg-secondary text-on-primary px-5 py-3 font-headline font-bold uppercase text-xs neo-border neo-shadow hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">bolt</span>
                    <span>Trigger Manually</span>
                  </button>
                </div>
              </article>
            ))}

            {crons.length === 0 && (
              <div className="border-4 border-dashed border-primary/40 p-12 text-center bg-surface-container-low">
                <span className="material-symbols-outlined text-6xl text-primary/40 mb-4">schedule</span>
                <p className="font-headline text-xl font-bold uppercase text-primary mb-2">No Cron Triggers Configured</p>
                <p className="font-body text-sm text-on-surface-variant">Schedules help execute background research tasks automatically.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
