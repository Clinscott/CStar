import type { WebSocket } from 'ws';

export const LEGACY_EVENT_MANAGER_RETIRED =
    'legacy_event_manager_retired_use_host_transport';

/** Inert compatibility singleton; it stores no listeners or clients. */
export class EventManager {
    private static instance: EventManager;

    private constructor() {}

    public static getInstance(): EventManager {
        EventManager.instance ??= new EventManager();
        return EventManager.instance;
    }

    public subscribe(_appId: string, _socket: WebSocket): never {
        throw new Error(LEGACY_EVENT_MANAGER_RETIRED);
    }

    public unsubscribe(_appId: string, _socket: WebSocket): never {
        throw new Error(LEGACY_EVENT_MANAGER_RETIRED);
    }

    public broadcast(_appId: string, _payload: unknown): never {
        throw new Error(LEGACY_EVENT_MANAGER_RETIRED);
    }
}
