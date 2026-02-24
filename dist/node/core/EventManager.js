import { WebSocket } from 'ws';
/**
 * [ODIN] The Nerve Center of the Universal Event Router.
 * Manages multi-tenant subscriptions and prevents memory leaks.
 */
export class EventManager {
    static instance;
    subscriptions = new Map();
    constructor() { }
    static getInstance() {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }
    subscribe(appId, ws) {
        if (!this.subscriptions.has(appId)) {
            this.subscriptions.set(appId, new Set());
        }
        this.subscriptions.get(appId)?.add(ws);
    }
    /**
     * [CRITICAL] Memory Leak Protection - Ghost Key Removal
     */
    unsubscribe(appId, ws) {
        const clients = this.subscriptions.get(appId);
        if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
                this.subscriptions.delete(appId);
            }
        }
    }
    broadcast(appId, payload) {
        const clients = this.subscriptions.get(appId);
        if (!clients)
            return;
        const message = JSON.stringify(payload);
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }
}
