import { WebSocket } from 'ws';
export interface CortexResponse {
    type: string;
    data: unknown;
    status: string;
}
export declare class CortexLink {
    private port;
    private host;
    private wsUrl;
    private wsImpl;
    private daemonChild;
    private activeSocket;
    constructor(port?: number, host?: string, wsImpl?: typeof WebSocket);
    /**
     * Handles the Two-Phase Commit for moving physical files and updating AST.
     * @param sourcePath Original file path relative to root
     * @param targetPath Target file path relative to root
     */
    handleArchitectMove(sourcePath: string, targetPath: string): Promise<boolean>;
    /**
     * Intercepts a file write intent and performs pre-disk adjudication via the Ghost Warden.
     * @param filePath Target file path
     * @param content Proposed content string
     * @returns Promise resolving to the verified content if cleared
     * @throws Error if Ghost Warden issues a PRECOGNITIVE_WARNING
     */
    interceptWrite(filePath: string, content: string): Promise<string>;
    /**
     * Checks if the daemon port is listening. If not, spawns the python daemon
     * as a background process and waits for the port to open.
     * In test mode, the process is attached so it dies with the test runner.
     */
    ensureDaemon(): Promise<void>;
    /**
     * Internal helper to quickly check if the port is open and accepting WebSocket connections.
     */
    private _checkPort;
    /**
     * Sends a command payload to the Python Daemon via WebSockets.
     * @param command
     * @param args
     * @param cwd
     */
    sendCommand(command: string, args?: string[], cwd?: string): Promise<CortexResponse>;
    /**
     * Sends a shutdown signal to the daemon and forces process death if attached.
     */
    shutdownDaemon(): Promise<void>;
}
