// Wire session events into the SSE route (Phase 1B)
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'app/api/mission/stream/route.ts';
let src = readFileSync(target, 'utf-8');

// 1. Add the session bus import.
const oldImport = "import { missionEventBus, type MissionChangeEvent } from '@/lib/events/bus';";
const newImport = "import { missionEventBus, type MissionChangeEvent } from '@/lib/events/bus';\nimport { sessionEventBus, type SessionEvent } from '@/lib/runtime/agent-session';";
if (!src.includes(oldImport)) {
    console.error('Could not find bus import');
    process.exit(1);
}
if (!src.includes(newImport)) {
    src = src.replace(oldImport, newImport);
}

// 2. Subscribe to the session bus inside the SSE start() and forward
//    session events as `session` SSE events. The chat UI listens for
//    this and renders streaming tokens + tool calls.
const oldSubscribe = `      // Subscribe to the bus. If \`projectId\` is set, only re-fetch when
      // a notification matches it (or a global null emit fires).
      const onChange = (event: MissionChangeEvent) => {
        if (projectId && event.missionId && event.missionId !== projectId) return;
        refetchAndSend('event', event.reason);
      };
      missionEventBus.onChange(onChange);`;
const newSubscribe = `      // Subscribe to the bus. If \`projectId\` is set, only re-fetch when
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
          controller.enqueue(encoder.encode(\`event: session\\ndata: \${JSON.stringify(event)}\\n\\n\`));
        } catch {
          closed = true;
        }
      };
      sessionEventBus.onEvent(onSessionEvent);`;
if (src.includes(oldSubscribe)) {
    src = src.replace(oldSubscribe, newSubscribe);
}

// 3. Make sure cleanup also unsubscribes from the session bus.
const oldCleanup = `      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(keepalive);
        missionEventBus.off('change', onChange);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };`;
const newCleanup = `      const cleanup = () => {
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
      };`;
if (src.includes(oldCleanup)) {
    src = src.replace(oldCleanup, newCleanup);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: SSE route wired for session bus');
