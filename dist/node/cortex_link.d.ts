import { WebSocket } from 'ws';
export interface CortexResponse {
    type: string;
    data: any;
    status: string;
}
export declare class CortexLink {
    private port;
    private host;
    private wsUrl;
    private wsImpl;
    constructor(port?: number, host?: string, wsImpl?: typeof WebSocket);
    /**
     * Checks if the daemon port is listening. If not, spawns the python daemon
     * as a detached background process and waits for the port to open.
     */
    ensureDaemon(): Promise<void>;
    /**
     * Internal helper to quickly check if the port is open and accepting WebSocket connections.
     */
    private _checkPort;
    /**
     * Sends a command payload to the Python Daemon via WebSockets.
     */
    sendCommand(command: string, args?: string[], cwd?: string): Promise<any>;
}
