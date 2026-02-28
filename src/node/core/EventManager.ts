import { WebSocket } from 'ws';

/**
 * [O.D.I.N.] The Nerve Center of the Universal Event Router.
 * Manages multi-tenant subscriptions and prevents memory leaks.
 */
export class EventManager {
    private static instance: EventManager;
    private subscriptions: Map<string, Set<WebSocket>> = new Map();

    private constructor() { }

    public static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }

    public subscribe(appId: string, ws: WebSocket): void {
        if (!this.subscriptions.has(appId)) {
            this.subscriptions.set(appId, new Set());
        }
        this.subscriptions.get(appId)?.add(ws);
    }

    /**
     * [CRITICAL] Memory Leak Protection - Ghost Key Removal
     */
    public unsubscribe(appId: string, ws: WebSocket): void {
        const clients = this.subscriptions.get(appId);
        if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
                this.subscriptions.delete(appId);
            }
        }
    }

    public broadcast(appId: string, payload: any): void {
        const clients = this.subscriptions.get(appId);
        if (!clients) return;

        const message = JSON.stringify(payload);
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }
}
