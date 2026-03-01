import { Server } from 'http';
/**
 * SubspaceRelay: WebSocket broadcast bridge for PennyOne
 */
export declare class SubspaceRelay {
    private wss;
    private clients;
    constructor(server: Server);
    /**
     * Start a chronological playback of an old session.
     * @param {unknown[]} pings - Pings to play back
     * @param {number} speed - Playback speed
     */
    startPlayback(pings: unknown[], speed?: number): Promise<void>;
    /**
     * Broadcast a message to all connected visualizers
     * @param {"NODE_UPDATED" | "GRAPH_REBUILT" | "AGENT_TRACE"} type - Event type
     * @param {unknown} payload - Event payload
     */
    broadcast(type: 'NODE_UPDATED' | 'GRAPH_REBUILT' | 'AGENT_TRACE', payload: unknown): void;
}
