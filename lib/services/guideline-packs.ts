import crypto from "node:crypto";
import dbClient from "../../lib/database/db_client";

export interface GuidelinePack {
  id: string;
  name: string;
  language?: string | null;
  framework?: string | null;
  context?: string | null;
  rules: string[];
  reminders: string[];
}

function id() {
  return `guide-${crypto.randomUUID()}`;
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class GuidelinePackService {
  async ensureDefaults() {
    const defaults: GuidelinePack[] = [
      {
        id: "guide-typescript",
        name: "TypeScript Review Standards",
        language: "typescript",
        framework: null,
        context: "code-review",
        rules: [
          "Keep public types explicit at module boundaries.",
          "Prefer existing project helpers over new abstractions.",
          "Preserve strict type checks and avoid broad any usage in new interfaces.",
        ],
        reminders: ["Supervisor should request tests for changed runtime behavior."],
      },
      {
        id: "guide-next",
        name: "Next.js Interface Standards",
        language: "typescript",
        framework: "next",
        context: "frontend",
        rules: [
          "Keep server actions and route handlers permission-aware.",
          "Avoid importing reference repos into active bundles.",
          "Use visible status and evidence instead of silent simulation.",
        ],
        reminders: ["Show why a governing agent made a decision when blocking or escalating."],
      },
    ];

    for (const pack of defaults) {
      await this.upsert(pack);
    }
  }

  async upsert(input: GuidelinePack): Promise<GuidelinePack> {
    const pack = { ...input, id: input.id || id() };
    await dbClient.execute(
      `INSERT INTO Guideline_Packs
        (id, name, language, framework, context, rules, reminders, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         language = excluded.language,
         framework = excluded.framework,
         context = excluded.context,
         rules = excluded.rules,
         reminders = excluded.reminders,
         updated_at = CURRENT_TIMESTAMP`,
      [
        pack.id,
        pack.name,
        pack.language || null,
        pack.framework || null,
        pack.context || null,
        JSON.stringify(pack.rules),
        JSON.stringify(pack.reminders),
      ],
    );
    return pack;
  }

  async select(input: { language?: string; framework?: string; context?: string }): Promise<GuidelinePack[]> {
    await this.ensureDefaults();
    const language = input.language?.toLowerCase() || "";
    const framework = input.framework?.toLowerCase() || "";
    const context = input.context?.toLowerCase() || "";
    const rows = await dbClient.query<any>(
      `SELECT * FROM Guideline_Packs
       WHERE (language IS NULL OR lower(language) = ?)
         AND (framework IS NULL OR lower(framework) = ?)
         AND (context IS NULL OR lower(context) = ?)
       ORDER BY framework DESC, language DESC, name ASC`,
      [language, framework, context],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      framework: row.framework,
      context: row.context,
      rules: safeJson(row.rules, []),
      reminders: safeJson(row.reminders, []),
    }));
  }

  async list(): Promise<GuidelinePack[]> {
    await this.ensureDefaults();
    const rows = await dbClient.query<any>(`SELECT * FROM Guideline_Packs ORDER BY name ASC`);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      framework: row.framework,
      context: row.context,
      rules: safeJson(row.rules, []),
      reminders: safeJson(row.reminders, []),
    }));
  }

  composeReviewContext(packs: GuidelinePack[]) {
    return packs.map((pack) => `# ${pack.name}\nRules:\n- ${pack.rules.join("\n- ")}\nReminders:\n- ${pack.reminders.join("\n- ")}`).join("\n\n");
  }
}

export const guidelinePackService = new GuidelinePackService();
