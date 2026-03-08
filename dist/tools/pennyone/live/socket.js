import { WebSocketServer, WebSocket } from 'ws';
import chalk from 'chalk';
/**
 * SubspaceRelay: WebSocket broadcast bridge for PennyOne
 */
export class SubspaceRelay {
    wss;
    clients = new Set();
    constructor(server) {
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
     * @param {unknown[]} pings - Pings to play back
     * @param {number} speed - Playback speed
     */
    async startPlayback(pings, speed = 2.0) {
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
        console.log(chalk.magenta('[ALFRED]: "Chronicle Playback complete."'));
    }
    /**
     * Broadcast a message to all connected visualizers
     * @param {"NODE_UPDATED" | "GRAPH_REBUILT" | "AGENT_TRACE" | "MISSION_TRACE"} type - Event type
     * @param {unknown} payload - Event payload
     */
    broadcast(type, payload) {
        const message = JSON.stringify({ type, payload });
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
}
