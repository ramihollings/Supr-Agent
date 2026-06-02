export interface LiveEvent {
  type: string;
  missionId?: string;
  data: any;
  timestamp: string;
}

type ClientCallback = (event: LiveEvent) => void;

export class LiveEventsManager {
  private clients: Set<ClientCallback> = new Set();

  /**
   * Registers a connection/client to receive live event streams.
   * Returns a cleanup function to unsubscribe the client.
   */
  registerClient(callback: ClientCallback): () => void {
    this.clients.add(callback);
    console.log(`[LiveEvents] Client connected. Active clients: ${this.clients.size}`);
    
    return () => {
      this.clients.delete(callback);
      console.log(`[LiveEvents] Client disconnected. Active clients: ${this.clients.size}`);
    };
  }

  /**
   * Broadcasts a live event to all connected clients.
   */
  emit(type: string, data: any, missionId?: string): void {
    const event: LiveEvent = {
      type,
      missionId,
      data,
      timestamp: new Date().toISOString()
    };

    console.log(`[LiveEvents] Broadcasting event '${type}' to ${this.clients.size} clients...`);
    
    for (const callback of this.clients) {
      try {
        callback(event);
      } catch (err) {
        console.error("[LiveEvents] Error delivering event to client, removing client:", err);
        this.clients.delete(callback);
      }
    }
  }
}

export const liveEventsManager = new LiveEventsManager();
export default liveEventsManager;
