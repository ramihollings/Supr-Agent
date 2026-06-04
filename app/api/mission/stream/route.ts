import { NextRequest } from 'next/server';
import { getActiveMission, getMissionById } from '@/lib/db';
import { Mission } from '@/types';
import { requireApiAuth } from '@/lib/auth';
import { missionEventBus, type MissionChangeEvent } from '@/lib/events/bus';
import { sessionEventBus, type SessionEvent } from '@/lib/runtime/agent-session';

export const dynamic = 'force-dynamic';

// Safety-net poll: in case an emit was missed (process restart, an
// out-of-process mutation, a future code path that forgot to call
// notifyMissionChanged), the stream still picks up changes at this
// interval. 10s is light on the DB and short enough that nothing
// looks stuck.
const SAFETY_NET_POLL_MS = 10_000;

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const encoder = new TextEncoder();
  const projectId = req.nextUrl.searchParams.get('id');

  // Lightweight hash: only check key fields, not the entire serialized object
  const computeHash = (m: Mission): string => {
    return `${m.status}:${m.readinessScore}:${m.phases.map(p => p.status).join(',')}:${m.tasks.map(t => t.status).join(',')}:${m.artifacts?.length ?? 0}:${m.failures?.filter(f => !f.resolved).length ?? 0}`;
  };

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (eventName: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const sendComment = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ${text}\n\n`));
        } catch {
          closed = true;
        }
      };

      const fetchProject = async (): Promise<Mission | undefined> => {
        if (projectId) {
          return await getMissionById(projectId);
        }
        return await getActiveMission();
      };

      // Initial send
      let lastHash = '';
      try {
        const initialMission = await fetchProject();
        if (initialMission) {
          lastHash = computeHash(initialMission);
          send('mission', { type: 'mission', mission: initialMission });
        } else {
          send('no_mission', { type: 'no_mission' });
        }
      } catch (error) {
        console.error('SSE initial fetch failed:', error);
        send('error', { type: 'error', message: String(error) });
      }

      // Subscribe to the bus. If `projectId` is set, only re-fetch when
      // a notification matches it (or a global null emit fires).
      const onChange = (event: MissionChangeEvent) => {
        if (projectId && event.missionId && event.missionId !== projectId) return;
        refetchAndSend('event', event.reason);
      };
      missionEventBus.onChange(onChange);

      // Phase 1B: subscribe to the session bus so the chat UI can
      // stream model chunks, tool calls, and reflection events as
      // they happen. We don't filter by projectId here because the
      // session bus is mission-scoped already, and the chat already
      // discards events for missions it isn't viewing.
      const onSessionEvent = (event: SessionEvent) => {
        if (projectId && event.missionId && event.missionId !== projectId) return;
        try {
          controller.enqueue(encoder.encode(`event: session\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      sessionEventBus.onEvent(onSessionEvent);

      const refetchAndSend = async (kind: 'event' | 'poll', reason: string) => {
        if (closed) return;
        try {
          const mission = await fetchProject();
          if (!mission) {
            send('no_mission', { type: 'no_mission' });
            return;
          }
          const currentHash = computeHash(mission);
          if (currentHash !== lastHash) {
            lastHash = currentHash;
            send('mission', { type: kind, reason, mission });
          }
        } catch (error) {
          console.error('SSE refetch failed:', error);
        }
      };

      // Safety-net poll, in case an emit was missed.
      const interval = setInterval(() => {
        if (closed) return;
        refetchAndSend('poll', 'safety_net_poll');
      }, SAFETY_NET_POLL_MS);

      // Keepalive comments every 25s so reverse proxies don't drop the
      // connection on a quiet mission.
      const keepalive = setInterval(() => sendComment('keepalive'), 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(keepalive);
        missionEventBus.off('change', onChange);
        sessionEventBus.offEvent(onSessionEvent);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
