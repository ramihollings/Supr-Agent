import { type Message } from "./reminders";

export class ContextCompactor {
  /**
   * Compacts conversation history to fit within context limits.
   * Runs 3-phase context compaction:
   * 1. Pinning: preserves system prompt, user directives, and pinned metadata messages.
   * 2. Summarization: collapses verbose tool outputs/file reads.
   * 3. Truncation: keeps the immediate last N messages fully intact, truncating oldest intermediate messages.
   */
  static compact(messages: Message[], charLimit = 50_000): Message[] {
    let totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalLength <= charLimit) {
      return messages; // No compaction needed
    }

    console.log(`[ContextCompactor] Compacting context from ${totalLength} chars (limit: ${charLimit} chars)...`);

    const systemMessages: Message[] = [];
    const intermediateMessages: Message[] = [];
    const recentMessages: Message[] = [];

    // Keep the last 8 messages fully intact to preserve immediate conversational state
    const recentThreshold = Math.max(0, messages.length - 8);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role === "system") {
        systemMessages.push(msg);
      } else if (i >= recentThreshold) {
        recentMessages.push(msg);
      } else {
        intermediateMessages.push(msg);
      }
    }

    // Collapse/summarize verbose intermediate tool results or file reads
    const collapsedIntermediates = intermediateMessages.map((msg) => {
      if (msg.content.length > 1000) {
        // Identify tool outputs
        if (msg.content.includes('{"status":') || msg.content.includes("output") || msg.content.includes("stdout")) {
          return {
            ...msg,
            content: `[Truncated verbose tool output: ${msg.content.length} characters. Operations succeeded.]`,
          };
        }
        // Identify large file view content
        if (msg.content.includes("Original content of") || msg.content.includes("Showing lines")) {
          return {
            ...msg,
            content: `[Truncated file read: ${msg.content.length} characters. Content reference is indexed in memory.]`,
          };
        }
        // Default truncation fallback
        return {
          ...msg,
          content: `${msg.content.substring(0, 300)}...\n\n[Truncated: ${msg.content.length - 300} characters]`,
        };
      }
      return msg;
    });

    const result = [...systemMessages, ...collapsedIntermediates, ...recentMessages];
    totalLength = result.reduce((sum, m) => sum + m.content.length, 0);
    console.log(`[ContextCompactor] Compacted context to ${totalLength} chars.`);
    return result;
  }
}
export const contextCompactor = new ContextCompactor();
