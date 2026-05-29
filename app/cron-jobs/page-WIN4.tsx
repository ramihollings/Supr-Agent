"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect } from 'react';
import { 
  fetchCronJobsState, 
  toggleCronJobAction, 
  triggerCronJobAction, 
  createCronJobAction, 
  updateCronJobAction, 
  deleteCronJobAction,
  fetchAgentsState,
  fetchMissionsAction
} from '@/app/actions';
import { Agent } from '@/types';

interface CronJob {
  id: string;
  name: string;
  interval: string;
  targetAction: string;
  lastRun: string | null;
  status: string;
  assignedAgentId?: string | null;
  associatedTaskId?: string | null;
}

const INTERVAL_OPTIONS = [
  'Every 1 minute',
  'Every 5 minutes',
  'Every 15 minutes',
  'Every 30 minutes',
  'Hourly',
  'Every 2 hours',
  'Every 6 hours',
  'Every 12 hours',
  'Daily at midnight',
  'Daily at 6am',
  'Daily at noon',
  'Weekly on Monday',
  'Weekly on Friday',
  'Monthly on the 1st',
];

export default function CronJobsPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string; missionName: string }[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCron, setNewCron] = useState({ 
    name: '', 
    interval: 'Hourly', 
    targetAction: '', 
    assignedAgentId: '', 
    associatedTaskId: '' 
  });

  // Edit modal state
  const [editingCron, setEditingCron] = useState<CronJob | null>(null);
  const [editForm, setEditForm] = useState({ 
    name: '', 
    interval: '', 
    targetAction: '', 
    assignedAgentId: '', 
    associatedTaskId: '' 
  });

  // Delete confirmation state
  const [deletingCron, setDeletingCron] = useState<CronJob | null>(null);

  const loadCrons = async () => {
    setIsLoading(true);
    const data = await fetchCronJobsState();
    if (data) setCrons(data);
    setIsLoading(false);
  };

  useEffect(() => {
    let active = true;
    
    fetchCronJobsState().then(data => {
      if (active) {
        if (data) setCrons(data);
        setIsLoading(false);
      }
    });

    fetchAgentsState().then(data => {
      if (active && data) {
        setAgents(data);
      }
    });

    fetchMissionsAction().then(data => {
      if (active && data) {
        const allTasks: { id: string; title: string; missionName: string }[] = [];
        data.forEach(m => {
          if (m.tasks) {
            m.tasks.forEach(t => {
              allTasks.push({ id: t.id, title: t.title, missionName: m.name });
            });
          }
        });
        setTasks(allTasks);
      }
    });

    return () => { active = false; };
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

  const handleCreate = async () => {
    if (!newCron.name.trim() || !newCron.targetAction.trim()) {
      showToast('Please fill in all fields.');
      return;
    }
    
    const res = await createCronJobAction({
      name: newCron.name,
      interval: newCron.interval,
      targetAction: newCron.targetAction,
      assignedAgentId: newCron.assignedAgentId || undefined,
      associatedTaskId: newCron.associatedTaskId || undefined
    });
    
    if (res.success) {
      showToast(`Schedule "${newCron.name}" created! ✓`);
      setShowCreateModal(false);
      setNewCron({ name: '', interval: 'Hourly', targetAction: '', assignedAgentId: '', associatedTaskId: '' });
      loadCrons();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingCron || !editForm.name.trim() || !editForm.targetAction.trim()) {
      showToast('Please fill in all fields.');
      return;
    }
    
    const res = await updateCronJobAction(editingCron.id, {
      name: editForm.name,
      interval: editForm.interval,
      targetAction: editForm.targetAction,
      assignedAgentId: editForm.assignedAgentId || undefined,
      associatedTaskId: editForm.associatedTaskId || undefined
    });
    
    if (res.success) {
      showToast(`Schedule "${editForm.name}" updated! ✓`);
      setEditingCron(null);
      loadCrons();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingCron) return;
    const res = await deleteCronJobAction(deletingCron.id);
    if (res.success) {
      showToast(`Schedule "${deletingCron.name}" permanently removed.`);
      setDeletingCron(null);
      loadCrons();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  const openEdit = (job: CronJob) => {
    setEditingCron(job);
    setEditForm({ 
      name: job.name, 
      interval: job.interval, 
      targetAction: job.targetAction,
      assignedAgentId: job.assignedAgentId || '',
      associatedTaskId: job.associatedTaskId || ''
    });
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
              Create, schedule, and manage recurring background automations. Sub-agents execute tasks on fixed intervals.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-primary text-on-primary neo-border font-headline font-bold uppercase text-xl py-4 px-8 hover:bg-background hover:text-primary neo-shadow transition-all active:translate-x-1 active:translate-y-1 flex items-center gap-3 shrink-0"
          >
            <span className="material-symbols-outlined">add_circle</span>
            New Schedule
          </button>
        </header>

        {isLoading ? (
          <div className="font-mono text-primary text-lg uppercase font-bold animate-pulse">Connecting to Cron Daemon...</div>
        ) : (
          <>
            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="neo-border bg-primary-container p-5 flex items-center gap-4">
                <span className="material-symbols-outlined text-3xl text-primary">schedule</span>
                <div>
                  <p className="font-headline font-black text-3xl text-primary">{crons.length}</p>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant">Total Schedules</p>
                </div>
              </div>
              <div className="neo-border bg-surface p-5 flex items-center gap-4">
                <span className="material-symbols-outlined text-3xl text-tertiary">play_circle</span>
                <div>
                  <p className="font-headline font-black text-3xl text-tertiary">{crons.filter(c => c.status === 'Active').length}</p>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant">Active</p>
                </div>
              </div>
              <div className="neo-border bg-surface p-5 flex items-center gap-4">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant">pause_circle</span>
                <div>
                  <p className="font-headline font-black text-3xl text-on-surface-variant">{crons.filter(c => c.status === 'Paused').length}</p>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant">Paused</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {crons.map(job => (
                <article 
                  key={job.id} 
                  className={`neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col relative overflow-hidden transition-all ${
                    job.status === 'Paused' ? 'opacity-85 bg-surface-variant-dim' : ''
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-6">
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

                      {/* Relational Bindings display */}
                      {(job.assignedAgentId || job.associatedTaskId) && (
                        <div className="flex gap-3 mt-2 flex-wrap">
                          {job.assignedAgentId && (
                            <span className="bg-primary-container border-2 border-primary px-2.5 py-0.5 font-headline text-[11px] text-primary flex items-center gap-1 font-bold">
                              <span className="material-symbols-outlined text-xs">smart_toy</span>
                              Agent: {agents.find(a => a.id === job.assignedAgentId)?.name || job.assignedAgentId}
                            </span>
                          )}
                          {job.associatedTaskId && (
                            <span className="bg-secondary-container border-2 border-secondary px-2.5 py-0.5 font-headline text-[11px] text-secondary flex items-center gap-1 font-bold">
                              <span className="material-symbols-outlined text-xs">task</span>
                              Task: {tasks.find(t => t.id === job.associatedTaskId)?.title || job.associatedTaskId}
                            </span>
                          )}
                        </div>
                      )}

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
                        <span>{job.status === 'Active' ? 'Pause' : 'Resume'}</span>
                      </button>
                      
                      <button 
                        onClick={() => handleTrigger(job.id, job.name)}
                        className="bg-secondary text-on-primary px-5 py-3 font-headline font-bold uppercase text-xs neo-border neo-shadow hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">bolt</span>
                        <span>Run Now</span>
                      </button>

                      <button 
                        onClick={() => openEdit(job)}
                        className="bg-background text-primary px-5 py-3 font-headline font-bold uppercase text-xs neo-border neo-shadow hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-surface-container transition-all flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        <span>Edit</span>
                      </button>

                      <button 
                        onClick={() => setDeletingCron(job)}
                        className="bg-background text-error px-5 py-3 font-headline font-bold uppercase text-xs neo-border border-error neo-shadow hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-error hover:text-on-error transition-all flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {crons.length === 0 && (
                <div className="border-4 border-dashed border-primary/40 p-12 text-center bg-surface-container-low">
                  <span className="material-symbols-outlined text-6xl text-primary/40 mb-4 block">schedule</span>
                  <p className="font-headline text-xl font-bold uppercase text-primary mb-2">No Cron Triggers Configured</p>
                  <p className="font-body text-sm text-on-surface-variant mb-6">Create your first scheduled automation to get started.</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-primary text-on-primary neo-border px-6 py-3 font-headline font-bold uppercase hover:bg-tertiary transition-colors flex items-center gap-2 mx-auto"
                  >
                    <span className="material-symbols-outlined">add_circle</span> Create Schedule
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container w-full max-w-xl neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col animate-fade-in">
            <div className="bg-primary p-4 border-b-4 border-primary flex justify-between items-center">
              <h2 className="font-headline font-black uppercase text-2xl text-primary-fixed tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined">add_circle</span>
                New Scheduled Automation
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-primary-fixed hover:text-surface transition-colors">
                <span className="material-symbols-outlined text-3xl font-black">close</span>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Schedule Name</label>
                <input
                  type="text"
                  value={newCron.name}
                  onChange={e => setNewCron({ ...newCron, name: e.target.value })}
                  className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  placeholder="e.g. Daily Competitor Scan"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Assign Agent (Optional)</label>
                  <select
                    value={newCron.assignedAgentId}
                    onChange={e => setNewCron({ ...newCron, assignedAgentId: e.target.value })}
                    className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  >
                    <option value="">-- No Assigned Agent --</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Associate Task (Optional)</label>
                  <select
                    value={newCron.associatedTaskId}
                    onChange={e => setNewCron({ ...newCron, associatedTaskId: e.target.value })}
                    className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  >
                    <option value="">-- No Associated Task --</option>
                    {tasks.map(t => (
                      <option key={t.id} value={t.id}>[{t.missionName}] {t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Interval / Frequency</label>
                <select
                  value={newCron.interval}
                  onChange={e => setNewCron({ ...newCron, interval: e.target.value })}
                  className="w-full bg-background neo-border p-3 font-body font-bold uppercase focus:outline-none focus:border-tertiary"
                >
                  {INTERVAL_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Target Action / Description</label>
                <textarea
                  value={newCron.targetAction}
                  onChange={e => setNewCron({ ...newCron, targetAction: e.target.value })}
                  className="w-full bg-background neo-border p-3 font-body text-sm h-24 focus:outline-none focus:border-tertiary custom-scrollbar"
                  placeholder="Describe what this automation does when triggered..."
                />
              </div>
            </div>
            <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="bg-background text-primary neo-border px-6 py-3 font-headline font-bold uppercase hover:bg-surface-variant transition-colors"
              >Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!newCron.name.trim() || !newCron.targetAction.trim()}
                className="bg-primary text-on-primary neo-border px-8 py-3 font-headline font-bold uppercase hover:bg-tertiary transition-colors disabled:opacity-50 flex items-center gap-2 active:translate-x-1 active:translate-y-1"
              >
                <span className="material-symbols-outlined">save</span> Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCron && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container w-full max-w-xl neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col animate-fade-in">
            <div className="bg-tertiary p-4 border-b-4 border-primary flex justify-between items-center">
              <h2 className="font-headline font-black uppercase text-2xl text-on-tertiary tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined">edit</span>
                Edit Schedule
              </h2>
              <button onClick={() => setEditingCron(null)} className="text-on-tertiary hover:text-surface transition-colors">
                <span className="material-symbols-outlined text-3xl font-black">close</span>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Schedule Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Assign Agent (Optional)</label>
                  <select
                    value={editForm.assignedAgentId}
                    onChange={e => setEditForm({ ...editForm, assignedAgentId: e.target.value })}
                    className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  >
                    <option value="">-- No Assigned Agent --</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Associate Task (Optional)</label>
                  <select
                    value={editForm.associatedTaskId}
                    onChange={e => setEditForm({ ...editForm, associatedTaskId: e.target.value })}
                    className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  >
                    <option value="">-- No Associated Task --</option>
                    {tasks.map(t => (
                      <option key={t.id} value={t.id}>[{t.missionName}] {t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Interval / Frequency</label>
                <select
                  value={editForm.interval}
                  onChange={e => setEditForm({ ...editForm, interval: e.target.value })}
                  className="w-full bg-background neo-border p-3 font-body font-bold uppercase focus:outline-none focus:border-tertiary"
                >
                  {INTERVAL_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Target Action / Description</label>
                <textarea
                  value={editForm.targetAction}
                  onChange={e => setEditForm({ ...editForm, targetAction: e.target.value })}
                  className="w-full bg-background neo-border p-3 font-body text-sm h-24 focus:outline-none focus:border-tertiary custom-scrollbar"
                />
              </div>
            </div>
            <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-end gap-3">
              <button
                onClick={() => setEditingCron(null)}
                className="bg-background text-primary neo-border px-6 py-3 font-headline font-bold uppercase hover:bg-surface-variant transition-colors"
              >Cancel</button>
              <button
                onClick={handleSaveEdit}
                disabled={!editForm.name.trim() || !editForm.targetAction.trim()}
                className="bg-tertiary text-on-tertiary neo-border px-8 py-3 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-50 flex items-center gap-2 active:translate-x-1 active:translate-y-1"
              >
                <span className="material-symbols-outlined">save</span> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCron && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container w-full max-w-md neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col animate-fade-in">
            <div className="bg-error p-4 border-b-4 border-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-on-error text-2xl">warning</span>
              <h2 className="font-headline font-black uppercase text-xl text-on-error tracking-tight">Confirm Deletion</h2>
            </div>
            <div className="p-8">
              <p className="font-body text-sm text-primary mb-2">You are about to permanently delete the following schedule:</p>
              <p className="font-headline font-black uppercase text-lg text-secondary border-l-4 border-secondary pl-3 mb-4">{deletingCron.name}</p>
              <p className="font-body text-xs text-on-surface-variant">This action cannot be undone. The schedule and all its execution history will be removed.</p>
            </div>
            <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-end gap-3">
              <button
                onClick={() => setDeletingCron(null)}
                className="bg-background text-primary neo-border px-6 py-3 font-headline font-bold uppercase hover:bg-surface-variant transition-colors"
              >Cancel</button>
              <button
                onClick={handleDelete}
                className="bg-error text-on-error neo-border px-8 py-3 font-headline font-bold uppercase hover:bg-secondary transition-colors flex items-center gap-2 active:translate-x-1 active:translate-y-1"
              >
                <span className="material-symbols-outlined">delete_forever</span> Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
