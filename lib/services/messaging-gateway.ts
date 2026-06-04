import crypto from "node:crypto";
import dbClient from "../../lib/database/db_client";
import { getSecretSetting, getSettingValue } from "../../lib/secrets";
import type { MessagingGatewayAdapter } from "../../lib/runtime/types";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function storeOutbound(input: {
  source: "telegram" | "slack" | "discord";
  actorId?: string | null;
  missionId?: string | null;
  reason: string;
  text: string;
  status: "queued" | "sent" | "failed";
  error?: string | null;
}) {
  const deliveryId = id("outbound");
  await dbClient.execute(
    `INSERT INTO Outbound_Messages (id, mission_id, source, actor_id, reason, text, status, error, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    [
      deliveryId,
      input.missionId || null,
      input.source,
      input.actorId || null,
      input.reason,
      input.text,
      input.status,
      input.error || null,
      input.status,
    ],
  );
  return deliveryId;
}

function textFromPayload(payload: any) {
  return String(payload?.text || payload?.message?.text || payload?.event?.text || payload?.content || "").trim();
}

async function configuredWebhookUrl(source: "slack" | "discord") {
  if (source === "slack") {
    return await getSecretSetting("integrations_slack", process.env.SLACK_WEBHOOK_URL);
  }
  return await getSecretSetting("integrations_discord", process.env.DISCORD_WEBHOOK_URL);
}

function outboundPayload(source: "slack" | "discord", text: string) {
  return source === "slack" ? { text } : { content: text };
}

function createWebhookAdapter(source: "slack" | "discord"): MessagingGatewayAdapter {
  return {
    source,
    supportsSource: (candidate) => candidate === source,
    normalizeActor: (payload: any) => String(payload?.user || payload?.author?.id || payload?.actorId || ""),
    receive: async (payload: any) => ({
      actorId: String(payload?.user || payload?.author?.id || payload?.actorId || ""),
      content: textFromPayload(payload),
      attachments: payload?.attachments || [],
    }),
    send: async (input) => {
      const webhookUrl = await configuredWebhookUrl(source);
      if (!webhookUrl) {
        const deliveryId = await storeOutbound({
          ...input,
          source,
          status: "failed",
          error: `${source} webhook is not configured.`,
        });
        return { ok: false, deliveryId, error: `${source} webhook is not configured.` };
      }

      const enabled = await getSettingValue(source === "slack" ? "channels_slack" : "channels_discord");
      if (enabled === "false") {
        const deliveryId = await storeOutbound({
          ...input,
          source,
          status: "failed",
          error: `${source} channel is disabled.`,
        });
        return { ok: false, deliveryId, error: `${source} channel is disabled.` };
      }

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(outboundPayload(source, input.text)),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          const error = `${source} webhook returned ${response.status}.`;
          const deliveryId = await storeOutbound({ ...input, source, status: "failed", error });
          return { ok: false, deliveryId, error };
        }
        const deliveryId = await storeOutbound({ ...input, source, status: "sent" });
        return { ok: true, deliveryId };
      } catch (error: any) {
        const message = error?.message || String(error);
        const deliveryId = await storeOutbound({ ...input, source, status: "failed", error: message });
        return { ok: false, deliveryId, error: message };
      }
    },
  };
}

export const telegramGatewayAdapter: MessagingGatewayAdapter = {
  source: "telegram",
  supportsSource: (source) => source === "telegram",
  normalizeActor: (payload: any) => String(payload?.message?.chat?.id || payload?.chatId || payload?.actorId || ""),
  receive: async (payload: any) => ({
    actorId: String(payload?.message?.chat?.id || payload?.chatId || payload?.actorId || ""),
    content: textFromPayload(payload),
    attachments: payload?.message?.document ? [payload.message.document] : [],
  }),
  send: async (input) => {
    const token = await getSecretSetting("telegram_token", process.env.TELEGRAM_BOT_TOKEN);
    if (!token) return { ok: false, error: "Telegram token not configured." };

    const chatId = input.actorId || await getSettingValue("telegram_chat_id") || process.env.TELEGRAM_CHAT_ID;
    if (!chatId) return { ok: false, error: "No chat ID available." };

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: input.text }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const error = `Telegram webhook returned ${response.status}.`;
        const deliveryId = await storeOutbound({ ...input, source: "telegram", status: "failed", error });
        return { ok: false, deliveryId, error };
      }

      const deliveryId = await storeOutbound({ ...input, source: "telegram", status: "sent" });
      return { ok: true, deliveryId };
    } catch (error: any) {
      const message = error?.message || String(error);
      const deliveryId = await storeOutbound({ ...input, source: "telegram", status: "failed", error: message });
      return { ok: false, deliveryId, error: message };
    }
  },
};

export const slackGatewayAdapter = createWebhookAdapter("slack");
export const discordGatewayAdapter = createWebhookAdapter("discord");

export class MessagingGateway {
  private adapters = [telegramGatewayAdapter, slackGatewayAdapter, discordGatewayAdapter];

  adapterFor(source: string) {
    return this.adapters.find((adapter) => adapter.supportsSource(source));
  }

  async notify(input: {
    source?: "telegram" | "slack" | "discord" | null;
    actorId?: string | null;
    missionId?: string | null;
    reason: "action completed" | "action failed" | "approval needed" | "mission finished";
    text: string;
  }) {
    if (!input.source || !input.actorId) return { ok: false, error: "No originating channel is available." };
    const adapter = this.adapterFor(input.source);
    if (!adapter) return { ok: false, error: `No messaging adapter for ${input.source}.` };
    return adapter.send({
      actorId: input.actorId,
      missionId: input.missionId || null,
      reason: input.reason,
      text: input.text,
    });
  }
}

export const messagingGateway = new MessagingGateway();
