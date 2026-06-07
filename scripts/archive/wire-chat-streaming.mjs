// scripts/wire-chat-streaming.mjs
// Wire the chat UI to render session events (Phase 1B chat side)
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'app/supr-chat/page.tsx';
let src = readFileSync(target, 'utf-8');

const oldLoadingState = "  const [chatLoading, setChatLoading] = useState(false);";
const newLoadingState = [
  "  const [chatLoading, setChatLoading] = useState(false);",
  "  // Phase 1B: streaming model chunks accumulate here keyed by agent id,",
  "  // rendered as a typewriter line above the final bubble.",
  "  const [streamingByAgent, setStreamingByAgent] = useState<Record<string, string>>({});",
  "  // Phase 1B: in-flight tool call strip cleared when matching tool_completed arrives.",
  "  const [activeToolCalls, setActiveToolCalls] = useState<Array<{ agentId: string; toolName: string; args: unknown; startedAt: string }>>([]);",
].join('\n');
if (src.includes(oldLoadingState) && !src.includes('streamingByAgent')) {
  src = src.replace(oldLoadingState, newLoadingState);
}

const oldEffectClose = "  useEffect(() => {\n    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });\n  }, [messages]);";
const newEffectClose = [
  "  useEffect(() => {",
  "    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });",
  "  }, [messages]);",
  "",
  "  // Phase 1B: while the chat is orchestrating, subscribe to the",
  "  // mission-scoped SSE stream and consume the new session event kind.",
  "  // Model chunks become a typewriter; tool_called/tool_completed become",
  "  // an activity strip so the user can see what sub-agents are doing.",
  "  useEffect(() => {",
  "    if (!chatLoading || typeof window === 'undefined') return;",
  "    const url = new URL('/api/mission/stream', window.location.origin);",
  "    const source = new EventSource(url.toString());",
  "    const handleSession = (e: MessageEvent) => {",
  "      try {",
  "        const event = JSON.parse(e.data);",
  "        if (event.kind === 'model_chunk') {",
  "          const agentId = String(event.data?.agentId || '');",
  "          if (!agentId) return;",
  "          const chunk = String(event.data?.chunk || '');",
  "          setStreamingByAgent((prev) => ({ ...prev, [agentId]: (prev[agentId] || '') + chunk }));",
  "        } else if (event.kind === 'tool_called') {",
  "          setActiveToolCalls((prev) => [",
  "            ...prev,",
  "            {",
  "              agentId: String(event.data?.agentId || ''),",
  "              toolName: String(event.data?.toolName || ''),",
  "              args: event.data?.args,",
  "              startedAt: event.at || new Date().toISOString(),",
  "            },",
  "          ]);",
  "        } else if (event.kind === 'tool_completed') {",
  "          setActiveToolCalls((prev) => prev.slice(0, -1));",
  "        } else if (event.kind === 'session_completed' || event.kind === 'session_failed') {",
  "          setStreamingByAgent({});",
  "        }",
  "      } catch {",
  "        // Ignore malformed session events; the SSE stream stays open.",
  "      }",
  "    };",
  "    source.addEventListener('session', handleSession);",
  "    return () => {",
  "      source.removeEventListener('session', handleSession);",
  "      source.close();",
  "    };",
  "  }, [chatLoading]);",
].join('\n');
if (src.includes(oldEffectClose) && !src.includes("addEventListener('session'")) {
  src = src.replace(oldEffectClose, newEffectClose);
}

const oldLoadingMarker = [
  "          {chatLoading && (",
  "            <div className=\"flex items-center gap-3 p-4 max-w-sm neo-border bg-background shadow-[4px_4px_0px_0px_var(--color-primary)]\">",
  "              <span className=\"material-symbols-outlined animate-spin text-primary\">sync</span>",
  "              <span className=\"font-headline font-bold text-xs uppercase text-primary\">Supr is orchestrating...</span>",
  "            </div>",
  "          )}",
  "",
  "          <div ref={messagesEndRef} />",
].join('\n');
const newLoadingMarker = [
  "          {chatLoading && (",
  "            <div className=\"flex items-center gap-3 p-4 max-w-sm neo-border bg-background shadow-[4px_4px_0px_0px_var(--color-primary)]\">",
  "              <span className=\"material-symbols-outlined animate-spin text-primary\">sync</span>",
  "              <span className=\"font-headline font-bold text-xs uppercase text-primary\">Supr is orchestrating...</span>",
  "            </div>",
  "          )}",
  "",
  "          {/* Phase 1B: live streaming output per agent */}",
  "          {Object.entries(streamingByAgent).map(([agentId, buffer]) => (",
  "            buffer.trim() ? (",
  "              <div key={stream-${agentId}} className=\"flex items-start gap-3 p-4 max-w-2xl neo-border bg-background text-on-background\">",
  "                <span className=\"material-symbols-outlined text-secondary animate-pulse text-base\">bolt</span>",
  "                <div className=\"flex-1 min-w-0\">",
  "                  <div className=\"text-[9px] font-black uppercase text-on-surface-variant mb-1 font-mono\">{agentId} streaming</div>",
  "                  <pre className=\"whitespace-pre-wrap font-mono text-[11px] leading-relaxed max-h-32 overflow-y-auto\">{buffer.slice(-2000)}</pre>",
  "                </div>",
  "              </div>",
  "            ) : null",
  "          ))}",
  "",
  "          {/* Phase 1B: in-flight tool call strip */}",
  "          {activeToolCalls.length > 0 && (",
  "            <div className=\"flex flex-wrap gap-2 p-3 max-w-2xl neo-border bg-surface-container\">",
  "              <span className=\"text-[9px] font-black uppercase text-primary font-mono\">Tools in flight:</span>",
  "              {activeToolCalls.map((tc, idx) => (",
  "                <span key={tc-${idx}-${tc.toolName}-${tc.startedAt}} className=\"text-[10px] font-mono font-bold uppercase px-2 py-1 bg-primary text-on-primary animate-pulse\">",
  "                  {tc.toolName}",
  "                </span>",
  "              ))}",
  "            </div>",
  "          )}",
  "",
  "          <div ref={messagesEndRef} />",
].join('\n');
if (src.includes(oldLoadingMarker) && !src.includes('streamingByAgent).map')) {
  src = src.replace(oldLoadingMarker, newLoadingMarker);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: chat UI wired for session bus events');
