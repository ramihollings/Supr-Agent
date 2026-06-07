// scripts/wire-compaction.mjs
// Phase 2B: when the recentTranscript grows past a threshold, the
// context-assembler compacts the older half into a single-line
// summary so the LLM prompt stays bounded. This is what lets the
// runtime handle hour-long missions without overflowing the context
// window.
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/context-assembler.ts';
let src = readFileSync(target, 'utf-8');

const oldTranscript = `  const events = await dbClient.query<any>(
    \`SELECT event_type, actor_id, summary, metadata, timestamp FROM Event_Log WHERE mission_id = ? ORDER BY timestamp DESC LIMIT 16\`,
    [action.missionId],
  );
  const recentTranscript = events.map((event) => {`;

const newTranscript = `  const events = await dbClient.query<any>(
    \`SELECT event_type, actor_id, summary, metadata, timestamp FROM Event_Log WHERE mission_id = ? ORDER BY timestamp DESC LIMIT 16\`,
    [action.missionId],
  );
  // Phase 2B: bounded transcript. We keep the most recent 6 events
  // verbatim and compact anything older into a single line. This
  // matches the chat UI's "scrollback" mental model: the user sees
  // the last few turns in full, the rest is summarised.
  const RECENT_TRANSCRIPT_VERBATIM = 6;
  const RECENT_TRANSCRIPT_COMPACT_THRESHOLD = 10;
  const compactOlderEvents = (compactEvents: any[]) => {
    if (compactEvents.length <= RECENT_TRANSCRIPT_COMPACT_THRESHOLD) return compactEvents;
    const recent = compactEvents.slice(0, RECENT_TRANSCRIPT_VERBATIM);
    const older = compactEvents.slice(RECENT_TRANSCRIPT_VERBATIM);
    const compactCount = older.length;
    const olderTypes = older.map((e) => e.event_type).join(', ');
    return [
      {
        event_type: 'runtime_compaction',
        actor_id: 'ContextCompactor',
        summary: \`[Compacted \${compactCount} earlier event(s): \${olderTypes}]\`,
        metadata: { originalCount: compactCount },
        timestamp: older[0]?.timestamp || new Date().toISOString(),
      },
      ...recent,
    ];
  };
  const compactedEvents = compactOlderEvents(events);
  const recentTranscript = compactedEvents.map((event) => {`;

if (src.includes(oldTranscript) && !src.includes('compactOlderEvents')) {
    src = src.replace(oldTranscript, newTranscript);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: context-assembler.ts transcript compaction wired');
