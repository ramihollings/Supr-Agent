"use client";

import { TopNav } from '@/components/TopNav';
import { useToast } from '@/components/ToastProvider';
import { useState, useEffect, useMemo } from 'react';
import { fetchMissionState } from '@/app/actions';
import { Mission } from '@/types';

type TeamSummary = {
  teamId: string;
  missionId: string | null;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  memberCount: number;
  coordinationMode: string;
  startedAt: string;
  completedAt: string | null;
  checksum: string;
};

type TeamMember = {
  memberId: string;
  slot: 'qa' | 'planner' | 'research' | 'supervisor' | 'extra' | string;
  name: string;
  role: string;
  task: string;
  permissionTier: string;
  tools: string[];
  targetFiles: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  result: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type TeamContextEntry = { key: string; value: string; updatedBy: string; updatedAt: string };
type TeamMessage = { id: string; from: string; to: string; kind: string; body: string; createdAt: string };

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [context, setContext] = useState<TeamContextEntry[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mission, setMission] = useState<Mission | null>(null);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [sseLastEventAt, setSseLastEventAt] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<{ teamId: string; memberName: string; completed: number; total: number | null; status: string } | null>(null);
  const { showToast } = useToast();

  const fetchTeams = async () => {
    try {
      const active = await fetchMissionState();
      if (active) setMission(active);
      const url = active ? new URL(`/api/teams?missionId=${encodeURIComponent(active.id)}`, window.location.origin) : new URL('/api/teams', window.location.origin);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load teams: ${res.status}`);
      const data = await res.json();
      setTeams(data.teams || []);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load teams: ${(err as Error).message}`);
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchDetail = async (teamId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load team: ${res.status}`);
      const data = await res.json();
      setMembers(data.members || []);
      setContext(data.context || []);
      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load team: ${(err as Error).message}`);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void fetchTeams();
  }, []);

  useEffect(() => {
    if (activeTeamId) void fetchDetail(activeTeamId);
  }, [activeTeamId]);

  // SSE subscription for live team progress on this page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL('/api/mission/stream', window.location.origin);
    if (mission?.id) url.searchParams.set('id', mission.id);
    const source = new EventSource(url.toString());
    setSseStatus('connecting');
    const onProgress = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        const p = payload?.payload as Record<string, unknown> | undefined;
        if (!p) return;
        setSseLastEventAt(new Date().toISOString());
        if (payload.reason === 'team_progress') {
          setLiveProgress({
            teamId: payload.teamId,
            memberName: (p.memberName as string) ?? '?',
            completed: typeof p.completedCount === 'number' ? p.completedCount : 0,
            total: typeof p.total === 'number' ? p.total : null,
            status: (p.status as string) ?? 'running',
          });
          // Refresh detail if the active team is the one moving
          if (activeTeamId === payload.teamId) void fetchDetail(payload.teamId);
        } else if (payload.reason === 'team_completed' || payload.reason === 'team_failed') {
          setLiveProgress(null);
          void fetchTeams();
          if (activeTeamId === payload.teamId) void fetchDetail(payload.teamId);
        }
      } catch { /* ignore */ }
    };
    source.addEventListener('open', () => setSseStatus('open'));
    source.addEventListener('error', () => setSseStatus('closed'));
    source.addEventListener('team_progress', onProgress);
    source.addEventListener('team_completed', onProgress);
    source.addEventListener('team_failed', onProgress);
    return () => {
      source.removeEventListener('team_progress', onProgress);
      source.removeEventListener('team_completed', onProgress);
      source.removeEventListener('team_failed', onProgress);
      source.close();
      setSseStatus('closed');
    };
  }, [activeTeamId, mission?.id]);

  // Safety-net poll for the team list and the active detail view.
  useEffect(() => {
    const id = setInterval(() => {
      void fetchTeams();
      if (activeTeamId) void fetchDetail(activeTeamId);
    }, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId]);

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Sub-Agent Teams" />
      <div className="flex items-center gap-2 border-b-2 border-primary bg-surface-container px-3 py-1 text-[10px] font-mono shrink-0" role="status" aria-live="polite">
        <span
          className={`px-2 py-0.5 border-2 border-primary font-headline font-black uppercase text-[9px] ${
            sseStatus === 'open' ? 'bg-tertiary text-on-tertiary' : sseStatus === 'connecting' ? 'bg-secondary text-on-error animate-pulse' : 'bg-error text-on-error'
          }`}
          title={`SSE stream status: ${sseStatus}`}
        >
          <span className="material-symbols-outlined text-[10px] align-middle">sensors</span>
          <span className="ml-1">{sseStatus === 'open' ? 'Live' : sseStatus === 'connecting' ? 'Connecting…' : 'Offline'}</span>
        </span>
        <span className="text-on-surface-variant">{teams.length} teams</span>
        {liveProgress && (
          <span className="text-secondary font-bold uppercase" title={`Live member: ${liveProgress.memberName}`}>
            {liveProgress.memberName} {liveProgress.status}
            {liveProgress.total != null ? ` (${liveProgress.completed}/${liveProgress.total})` : ''}
          </span>
        )}
        {sseLastEventAt && <span className="text-on-surface-variant">last: {new Date(sseLastEventAt).toLocaleTimeString()}</span>}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: team list */}
        <aside className="w-72 flex-none border-r-4 border-primary bg-background overflow-y-auto custom-scrollbar">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex items-center justify-between">
            <span className="font-headline font-black uppercase text-sm tracking-widest">Teams</span>
            <button onClick={() => void fetchTeams()} className="hover:text-primary" title="Refresh">
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
          {loadingTeams ? (
            <p className="p-3 text-on-surface-variant text-xs font-mono animate-pulse">Loading teams…</p>
          ) : teams.length === 0 ? (
            <p className="p-3 text-on-surface-variant text-xs italic">No teams yet. The Supr agent spawns teams via the spawn_subagent_team tool.</p>
          ) : (
            <ul>
              {teams.map((t) => {
                const isActive = t.teamId === activeTeamId;
                const statusTone =
                  t.status === 'completed' ? 'bg-tertiary text-on-tertiary' :
                  t.status === 'failed' ? 'bg-error text-on-error' :
                  t.status === 'running' || t.status === 'pending' ? 'bg-secondary text-on-error animate-pulse' :
                  'bg-surface-container text-on-surface-variant';
                return (
                  <li
                    key={t.teamId}
                    onClick={() => setActiveTeamId(t.teamId)}
                    className={`cursor-pointer border-b border-outline-variant p-3 transition-all ${
                      isActive ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container'
                    }`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTeamId(t.teamId);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-headline font-bold uppercase text-[12px] truncate">{t.name}</span>
                      <span className={`ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase border border-primary ${statusTone}`}>{t.status}</span>
                    </div>
                    <div className="font-mono text-[10px] text-on-surface-variant">
                      {t.memberCount} members · {t.coordinationMode} · {new Date(t.startedAt).toLocaleString()}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Right: detail */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-surface-container-lowest">
          {!activeTeamId && (
            <p className="text-on-surface-variant text-sm italic p-6 text-center">
              Select a team on the left to inspect its members, shared context, and message bus.
            </p>
          )}
          {activeTeamId && (
            <>
              {loadingDetail ? (
                <p className="text-on-surface-variant text-xs font-mono animate-pulse">Loading team detail…</p>
              ) : (
                <TeamDetail
                  members={members}
                  context={context}
                  messages={messages}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function TeamDetail({ members, context, messages }: { members: TeamMember[]; context: TeamContextEntry[]; messages: TeamMessage[] }) {
  const [tab, setTab] = useState<'members' | 'context' | 'messages'>('members');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b-2 border-primary">
        {([
          { id: 'members' as const, label: `Members (${members.length})`, icon: 'group' },
          { id: 'context' as const, label: `Shared Context (${context.length})`, icon: 'dataset' },
          { id: 'messages' as const, label: `Messages (${messages.length})`, icon: 'forum' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 h-8 border-r-2 border-primary last:border-r-0 font-headline font-black uppercase text-[11px] flex items-center gap-1 ${
              tab === t.id ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'members' && (
        <div className="space-y-2">
          {members.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic">No member rows for this team yet.</p>
          ) : (
            members.map((m) => (
              <article key={m.memberId} className="border-2 border-primary bg-surface p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    {m.slot === 'planner' ? 'edit_note' : m.slot === 'research' ? 'travel_explore' : m.slot === 'qa' ? 'verified' : m.slot === 'supervisor' ? 'psychology' : 'smart_toy'}
                  </span>
                  <span className="font-headline font-bold uppercase text-sm">{m.name}</span>
                  <span className="text-[10px] text-on-surface-variant uppercase">({m.role})</span>
                  <span className={`ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase border border-primary ${
                    m.status === 'completed' ? 'bg-tertiary text-on-tertiary' :
                    m.status === 'failed' ? 'bg-error text-on-error' :
                    m.status === 'running' ? 'bg-secondary text-on-error animate-pulse' :
                    'bg-surface-container text-on-surface-variant'
                  }`}>{m.status}</span>
                </div>
                <p className="font-body text-xs text-on-surface mb-2">{m.task}</p>
                <p className="font-mono text-[10px] text-on-surface-variant mb-1">
                  Tier: <span className="font-bold text-primary">{m.permissionTier}</span> · Tools: [{m.tools.join(', ')}]
                </p>
                {m.result && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[10px] font-headline font-bold uppercase text-primary">Output ({m.result.length} chars)</summary>
                    <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap bg-black text-amber-300 p-2 max-h-64 overflow-auto custom-scrollbar">{m.result}</pre>
                  </details>
                )}
                {m.error && (
                  <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap bg-error-container text-on-error-container p-2">Error: {m.error}</pre>
                )}
              </article>
            ))
          )}
        </div>
      )}
      {tab === 'context' && (
        <div className="space-y-2">
          {context.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic">No shared context written by this team yet.</p>
          ) : (
            context.map((c) => (
              <div key={c.key} className="border-2 border-primary bg-surface p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-headline font-black uppercase text-[10px] text-primary">{c.key}</span>
                  <span className="ml-auto font-mono text-[9px] text-on-surface-variant">by {c.updatedBy} · {new Date(c.updatedAt).toLocaleString()}</span>
                </div>
                <p className="font-body text-xs whitespace-pre-wrap break-words">{c.value}</p>
              </div>
            ))
          )}
        </div>
      )}
      {tab === 'messages' && (
        <div className="space-y-1 font-mono text-[11px]">
          {messages.length === 0 ? (
            <p className="text-on-surface-variant text-sm italic">No inter-agent messages on the bus yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="border border-outline-variant bg-surface p-2">
                <div className="text-[9px] text-on-surface-variant mb-0.5">
                  [{m.kind}] {m.from} → {m.to} · {new Date(m.createdAt).toLocaleTimeString()}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
