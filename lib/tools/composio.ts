/**
 * Composio bridge.
 *
 * Per Blueprint 5.0 Part 3.1, Composio is the single point of
 * authentication for third-party SaaS apps (GitHub, Slack, Notion,
 * Gmail, etc.). The agent runtime never sees raw OAuth tokens —
 * it calls into this bridge, which talks to the Composio API
 * using a server-side API key.
 *
 * Two entry points:
 *   1. In-process: `bridge.executeAction(actionName, params)` —
 *      used by the tool registry, agent runtime, and the MCP
 *      /api/mcp/tools route.
 *   2. CLI: `bin/supr-composio.mjs` — operator-facing tool for
 *      listing apps, initiating OAuth flows, and inspecting
 *      active connections.
 *
 * The API key is resolved at call time from the Settings table
 * (with an env-var fallback) so an operator can rotate it
 * without restarting the process.
 */
import { z } from 'zod';
import { toolRegistry, type ToolDefinition } from './registry';
// @ts-ignore - The types might be missing or incomplete depending on version
import { Composio } from 'composio-core';
import { getSecretSetting } from '@/lib/secrets';
import { redactSensitive, redactSensitiveText, serializeRedacted } from '@/lib/security/redaction';

export interface ComposioBridge {
  listApps(): Promise<Array<{ name: string; key: string; description?: string }>>;
  listConnections(): Promise<Array<{ id: string; app: string; status: string; createdAt?: string }>>;
  initiateConnection(appName: string): Promise<{ redirectUrl: string; connectionId?: string }>;
  executeAction(actionName: string, params: Record<string, unknown>): Promise<unknown>;
}

class SuprComposioBridge implements ComposioBridge {
  private async getClient(): Promise<Composio | null> {
    const apiKey = await getSecretSetting('integrations_composio', process.env.COMPOSIO_API_KEY);
    if (!apiKey) return null;
    return new Composio({ apiKey });
  }

  async listApps(): Promise<Array<{ name: string; key: string; description?: string }>> {
    const client = await this.getClient();
    if (!client) throw new Error('Composio is not configured. Set integrations_composio in Settings or COMPOSIO_API_KEY in env.');
    // The composio-core SDK exposes a list of supported apps via
    // the apps endpoint. We surface it as a flat list so the CLI
    // and the Settings UI can render a picker.
    const anyClient = client as any;
    if (typeof anyClient.apps?.list === 'function') {
      const apps = await anyClient.apps.list();
      return (apps || []).map((a: any) => ({
        name: a.name || a.displayName || a.key,
        key: a.key || a.slug || a.id,
        description: a.description,
      }));
    }
    if (Array.isArray(anyClient.apps)) {
      return anyClient.apps.map((a: any) => ({
        name: a.name || a.displayName || a.key,
        key: a.key || a.slug || a.id,
        description: a.description,
      }));
    }
    // SDK doesn't expose a list endpoint in this version. Return
    // the small built-in suite as a known fallback so the CLI
    // still has something useful to display.
    return [
      { key: 'github', name: 'GitHub', description: 'Repositories, issues, pull requests.' },
      { key: 'slack', name: 'Slack', description: 'Channels, messages, reactions.' },
      { key: 'notion', name: 'Notion', description: 'Pages, blocks, databases.' },
      { key: 'gmail', name: 'Gmail', description: 'Mail read, send, label.' },
      { key: 'google_calendar', name: 'Google Calendar', description: 'Events, calendars, scheduling.' },
      { key: 'google_drive', name: 'Google Drive', description: 'Files, folders, sharing.' },
      { key: 'google_sheets', name: 'Google Sheets', description: 'Spreadsheets, ranges, formulas.' },
      { key: 'linear', name: 'Linear', description: 'Issues, projects, cycles.' },
      { key: 'jira', name: 'Jira', description: 'Tickets, sprints, boards.' },
      { key: 'hubspot', name: 'HubSpot', description: 'Contacts, deals, companies.' },
      { key: 'salesforce', name: 'Salesforce', description: 'Accounts, opportunities, leads.' },
      { key: 'asana', name: 'Asana', description: 'Tasks, projects, sections.' },
      { key: 'trello', name: 'Trello', description: 'Boards, lists, cards.' },
      { key: 'figma', name: 'Figma', description: 'Files, comments, exports.' },
      { key: 'airtable', name: 'Airtable', description: 'Bases, tables, records.' },
      { key: 'zendesk', name: 'Zendesk', description: 'Tickets, macros, views.' },
      { key: 'sendgrid', name: 'SendGrid', description: 'Transactional email.' },
      { key: 'stripe', name: 'Stripe', description: 'Customers, subscriptions, invoices.' },
    ];
  }

  async listConnections(): Promise<Array<{ id: string; app: string; status: string; createdAt?: string }>> {
    const client = await this.getClient();
    if (!client) throw new Error('Composio is not configured.');
    const anyClient = client as any;
    if (typeof anyClient.connections?.list === 'function') {
      const rows = await anyClient.connections.list();
      return (rows || []).map((c: any) => ({
        id: c.id || c.uuid,
        app: c.appName || c.app || c.appKey,
        status: c.status || 'unknown',
        createdAt: c.createdAt || c.created_at,
      }));
    }
    if (Array.isArray(anyClient.connections)) {
      return anyClient.connections.map((c: any) => ({
        id: c.id || c.uuid,
        app: c.appName || c.app || c.appKey,
        status: c.status || 'unknown',
        createdAt: c.createdAt || c.created_at,
      }));
    }
    return [];
  }

  async initiateConnection(appName: string): Promise<{ redirectUrl: string; connectionId?: string }> {
    const client = await this.getClient();
    if (!client) throw new Error('Composio is not configured.');
    const anyClient = client as any;
    if (typeof anyClient.connections?.initiate === 'function') {
      const result = await anyClient.connections.initiate({ appName });
      return {
        redirectUrl: result.redirectUrl || result.redirect_url || result.url,
        connectionId: result.connectionId || result.id,
      };
    }
    if (typeof anyClient.getConnectionRequestLink === 'function') {
      // Older SDK shape.
      const link = await anyClient.getConnectionRequestLink(appName);
      return { redirectUrl: link };
    }
    throw new Error(`Composio SDK does not expose an initiate-connection API in this version.`);
  }

  async executeAction(actionName: string, params: Record<string, unknown>): Promise<unknown> {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Composio is not configured. Set integrations_composio in Settings or COMPOSIO_API_KEY in env.');
    }
    const anyClient = client as any;
    if (typeof anyClient.executeAction !== 'function') {
      throw new Error('Composio SDK does not expose executeAction().');
    }
    return redactSensitive(await anyClient.executeAction(actionName, params));
  }
}

export const composioBridge = new SuprComposioBridge();

/**
 * Map a dynamic Composio Tool action into the Supr native tool
 * registry. Used both at startup (initializeCoreComposioSuite) and
 * at runtime when the agent discovers a new action.
 */
export async function registerComposioTool(actionName: string, riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Medium'): Promise<ToolDefinition<any, any>> {
  const description = `Executes the ${actionName} action via Composio.`;
  const parameters = z.any();
  const toolDefinition: ToolDefinition<any, any> = {
    name: actionName.toLowerCase(),
    description,
    parameters,
    requiredTier: 'External_Act',
    riskLevel,
    execute: async (params) => {
      try {
        const response = await composioBridge.executeAction(actionName, params || {});
        return serializeRedacted(response);
      } catch (error: any) {
        throw new Error(`Composio Execution Failed: ${redactSensitiveText(error.message || String(error))}`);
      }
    },
  };
  toolRegistry.registerTool(toolDefinition);
  console.log(`[Composio] Bridged and registered tool: ${toolDefinition.name}`);
  return toolDefinition;
}

export async function initializeCoreComposioSuite(): Promise<void> {
  await registerComposioTool('GITHUB_CREATE_ISSUE', 'Medium');
  await registerComposioTool('SLACK_SEND_MESSAGE', 'Low');
  await registerComposioTool('NOTION_APPEND_BLOCK', 'Medium');
}
