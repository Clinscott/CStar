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
     * Start a chronological playback of an old session.
     */
    public async startPlayback(pings: any[], speed: number = 2.0) {
        console.log(chalk.magenta(`[ALFRED]: "Initiating Chronicle Playback. Replaying ${pings.length} actions at ${speed}x speed."`));
        
        for (let i = 0; i < pings.length; i++) {
            const ping = pings[i];
            this.broadcast('AGENT_TRACE', ping);

            if (i < pings.length - 1) {
                const nextPing = pings[i + 1];
                const delay = (nextPing.timestamp - ping.timestamp) / speed;
                
                // Cap delay at 2s for playback fluidity
                const actualDelay = Math.min(Math.max(delay, 100), 2000);
                await new Promise(resolve => setTimeout(resolve, actualDelay));
            }
        }
        
        console.log(chalk.magenta(`[ALFRED]: "Chronicle Playback complete."`));
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
