export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ReminderContext {
  agentName: string;
  allowedTools: string[];
  skills: Array<{ name: string; description: string }>;
}

export type ReminderRule = (messages: Message[], context: ReminderContext) => string | null;

export interface Reminder {
  name: string;
  position: "prepend" | "append";
  rule: ReminderRule;
}

export class ReminderEngine {
  private reminders: Reminder[] = [];

  constructor() {
    // Register built-in reminders
    this.registerReminder({
      name: "AvailableSkillsReminder",
      position: "prepend",
      rule: (messages, context) => {
        // Trigger on the first user message of the conversation
        const userMsgs = messages.filter((m) => m.role === "user");
        if (userMsgs.length === 1 && messages[messages.length - 1].role === "user") {
          if (context.skills && context.skills.length > 0) {
            const skillList = context.skills.map((s) => `- \`${s.name}\`: ${s.description}`).join("\n");
            return `You have the following specialized skills available to execute via the Skill tool:\n${skillList}`;
          }
        }
        return null;
      },
    });
  }

  /**
   * Register a custom rule-based reminder.
   */
  registerReminder(reminder: Reminder): void {
    this.reminders.push(reminder);
  }

  /**
   * Evaluates all registered reminders and returns lists of prepended/appended reminder strings.
   */
  evaluate(messages: Message[], context: ReminderContext): { prepends: string[]; appends: string[] } {
    const prepends: string[] = [];
    const appends: string[] = [];

    for (const reminder of this.reminders) {
      try {
        const text = reminder.rule(messages, context);
        if (text) {
          const formatted = `<system_reminder>\n${text}\n</system_reminder>`;
          if (reminder.position === "prepend") {
            prepends.push(formatted);
          } else {
            appends.push(formatted);
          }
        }
      } catch (err: any) {
        console.error(`[ReminderEngine] Error evaluating reminder '${reminder.name}':`, err);
      }
    }

    return { prepends, appends };
  }
}

export const reminderEngine = new ReminderEngine();
