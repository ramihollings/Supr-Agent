'use client';

import { useEffect, useRef, useState } from 'react';

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
};

export type CodeAgentChatPanelProps = {
  open: boolean;
  activeFile: string;
  activeFileContent: string;
  onClose: () => void;
};

export function CodeAgentChatPanel({
  open,
  activeFile,
  activeFileContent,
  onClose,
}: CodeAgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const storageKey = `supr.codeagent.chat.${activeFile}`;

  // Restore chat history per file from localStorage so a refresh keeps
  // the conversation context.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
      else setMessages([]);
    } catch {
      setMessages([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-200)));
    } catch {
      // ignore
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isStreaming]);

  if (!open) return null;

  const send = async () => {
    if (!input.trim() || isStreaming) return;
    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setIsStreaming(true);

    const agentId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: agentId, role: 'agent', content: '', timestamp: Date.now() },
    ]);

    try {
      const response = await fetch('/api/code-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: activeFile,
          fileContent: activeFileContent,
          // Pass the chat history as the research-context so the model
          // has the full conversation when proposing a fix.
          researchContext: next
            .map((m) => `${m.role === 'user' ? 'User' : 'Code Agent'}: ${m.content}`)
            .join('\n'),
          chatMode: true,
        }),
      });
      if (!response.body) throw new Error('No response stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assembled = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'status' && typeof msg.content === 'string') {
              assembled += `${msg.content}\n`;
              setMessages((prev) =>
                prev.map((m) => (m.id === agentId ? { ...m, content: assembled } : m)),
              );
            }
            if (msg.type === 'result') {
              const text = [
                msg.diagnosis ? `Diagnosis: ${msg.diagnosis}` : '',
                msg.fix ? `Fix: ${msg.fix}` : '',
                msg.testResult ? `Test: ${msg.testResult}` : '',
              ]
                .filter(Boolean)
                .join('\n\n');
              assembled = (assembled + '\n' + text).trim();
              setMessages((prev) =>
                prev.map((m) => (m.id === agentId ? { ...m, content: assembled } : m)),
              );
            }
            if (msg.type === 'error') {
              assembled += `\n[ERROR] ${msg.content}`;
              setMessages((prev) =>
                prev.map((m) => (m.id === agentId ? { ...m, content: assembled } : m)),
              );
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? { ...m, content: (m.content + `\n[ERROR] ${err.message || 'Chat failed'}`).trim() }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div
      className="absolute top-0 right-0 z-30 h-full w-80 border-l-4 border-primary bg-background shadow-[-6px_0_0_0_rgba(26,26,26,1)] flex flex-col"
      role="dialog"
      aria-label="Code Agent chat"
    >
      <header className="flex items-center gap-2 border-b-4 border-primary bg-primary text-on-primary p-2 shrink-0">
        <span className="material-symbols-outlined text-[18px]">psychology</span>
        <span className="font-headline font-black uppercase text-sm">Code Agent Chat</span>
        <span className="text-[9px] font-mono opacity-80 truncate" title={activeFile}>{activeFile}</span>
        <button
          onClick={onClose}
          className="ml-auto w-6 h-6 flex items-center justify-center border border-primary hover:bg-error hover:text-on-error"
          title="Close chat"
          aria-label="Close chat"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-surface-container-lowest text-xs">
        {messages.length === 0 && (
          <p className="text-on-surface-variant text-[10px] italic text-center p-3">
            Ask the Code Agent to refactor, explain, or repair <strong>{activeFile}</strong>.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-2 border-2 whitespace-pre-wrap break-words ${
              m.role === 'user'
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface border-primary text-on-surface'
            }`}
          >
            <p className="font-headline font-black uppercase text-[9px] mb-1">
              {m.role === 'user' ? 'You' : 'Code Agent'}
            </p>
            <p className="font-body leading-relaxed">{m.content || (isStreaming ? '…' : '')}</p>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.content === '' && (
          <div className="text-on-surface-variant text-[10px] animate-pulse">Code Agent is thinking…</div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t-4 border-primary p-2 flex gap-1 bg-surface shrink-0"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the Code Agent anything about this file…"
          rows={2}
          className="flex-1 bg-background border-2 border-primary px-2 py-1 font-body text-[11px] focus:outline-none focus:border-tertiary resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="bg-primary text-on-primary border-2 border-primary px-2 font-headline font-bold uppercase text-[10px] hover:bg-tertiary hover:text-on-tertiary disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
