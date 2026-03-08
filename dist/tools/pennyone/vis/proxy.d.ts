/**
 * P1 Visualization Proxy (v2.0)
 * Purpose: Lightweight static file server and WebSocket bridge for the P1 Dumb Client.
 * Mandate: Act as the "Eyes" for Muninn and other Ravens.
 * @param targetPath
 * @param port
 */
export declare function startProxy(targetPath: string, port?: number): Promise<void>;
