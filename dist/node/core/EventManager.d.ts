import { WebSocket } from 'ws';
/**
 * [ODIN] The Nerve Center of the Universal Event Router.
 * Manages multi-tenant subscriptions and prevents memory leaks.
 */
export declare class EventManager {
    private static instance;
    private subscriptions;
    private constructor();
    static getInstance(): EventManager;
    subscribe(appId: string, ws: WebSocket): void;
    /**
     * [CRITICAL] Memory Leak Protection - Ghost Key Removal
     */
    unsubscribe(appId: string, ws: WebSocket): void;
    broadcast(appId: string, payload: any): void;
}
