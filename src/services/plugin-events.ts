import { pluginWorkerManager } from "./plugin-workers";

export interface EventSubscription {
  id: string;
  eventType: string;
  pluginId?: string; // If subscribed by a plugin worker
  handler?: (payload: any) => void; // If registered locally by host code
}

export class PluginEventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map();

  /**
   * Register a local handler subscription.
   */
  subscribe(eventType: string, handler: (payload: any) => void): string {
    const subId = `sub-local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const list = this.subscriptions.get(eventType) || [];
    list.push({ id: subId, eventType, handler });
    this.subscriptions.set(eventType, list);
    return subId;
  }

  /**
   * Register a plugin worker subscription.
   */
  subscribePlugin(pluginId: string, eventType: string): string {
    const subId = `sub-plugin-${pluginId}-${Date.now()}`;
    const list = this.subscriptions.get(eventType) || [];
    list.push({ id: subId, eventType, pluginId });
    this.subscriptions.set(eventType, list);
    console.log(`[PluginEventBus] Plugin '${pluginId}' subscribed to event type: '${eventType}'`);
    return subId;
  }

  /**
   * Unsubscribe from an event type.
   */
  unsubscribe(subId: string): void {
    for (const [eventType, subs] of this.subscriptions.entries()) {
      const filtered = subs.filter(s => s.id !== subId);
      if (filtered.length !== subs.length) {
        this.subscriptions.set(eventType, filtered);
        break;
      }
    }
  }

  /**
   * Publish an event to all subscribers.
   */
  publish(eventType: string, payload: any): void {
    const subs = this.subscriptions.get(eventType) || [];
    if (subs.length === 0) return;

    console.log(`[PluginEventBus] Publishing event '${eventType}' to ${subs.length} subscribers...`);

    for (const sub of subs) {
      if (sub.handler) {
        try {
          sub.handler(payload);
        } catch (err) {
          console.error(`[PluginEventBus] Error executing local handler for '${eventType}':`, err);
        }
      } else if (sub.pluginId) {
        // Forward event message to the plugin worker process
        const success = pluginWorkerManager.sendToWorker(sub.pluginId, {
          type: "event",
          payload: { eventType, data: payload }
        });
        if (!success) {
          console.warn(`[PluginEventBus] Failed to deliver event to worker of plugin '${sub.pluginId}'.`);
        }
      }
    }
  }
}

export const pluginEventBus = new PluginEventBus();
export default pluginEventBus;
