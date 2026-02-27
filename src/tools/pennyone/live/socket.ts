import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import chalk from 'chalk';

/**
 * SubspaceRelay: WebSocket broadcast bridge for PennyOne
 */
export class SubspaceRelay {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();

    constructor(server: Server) {
        this.wss = new WebSocketServer({ server });

        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            console.log(chalk.blue('[ALFRED]: "New matrix connection established. Synchronizing telemetry stream."'));

            ws.on('close', () => {
                this.clients.delete(ws);
                console.log(chalk.blue('[ALFRED]: "Matrix connection terminated."'));
            });
        });
    }

    /**
     * Broadcast a message to all connected visualizers
     */
    public broadcast(type: 'NODE_UPDATED' | 'GRAPH_REBUILT' | 'AGENT_TRACE', payload: any) {
        const message = JSON.stringify({ type, payload });
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}
