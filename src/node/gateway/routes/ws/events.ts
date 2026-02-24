import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';
import { EventManager } from '../../../core/EventManager.js';

/**
 * [Ω] The Universal Event Router WebSocket Endpoint
 * Handles tenant-aware subscriptions and mobile-edge stability.
 */
const wsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    fastify.get('/connect', { websocket: true }, (connection: any, req: any) => {
        // 1. Mandatory app_id Extraction
        const appId = (req.query as any)?.app_id;
        if (!appId) {
            fastify.log.warn('⚠️ Rejected WebSocket: Missing app_id');
            connection.socket.close(1008, 'Missing app_id');
            return;
        }

        const eventManager = EventManager.getInstance();
        const ws = connection.socket as WebSocket;

        // 2. Heartbeat Termination Flag
        (ws as any).isAlive = true;
        ws.on('pong', () => { (ws as any).isAlive = true; });

        eventManager.subscribe(appId, ws as any);
        fastify.log.info(`📡 Subscribed [${appId}] to Event Router.`);

        // 3. 30s Heartbeat Check (Enforcement)
        const interval = setInterval(() => {
            if ((ws as any).isAlive === false) {
                fastify.log.warn(`💀 Terminating dead connection for [${appId}].`);
                clearInterval(interval);
                return ws.terminate();
            }

            (ws as any).isAlive = false;
            ws.ping();
        }, 30000);

        ws.on('close', () => {
            clearInterval(interval);
            eventManager.unsubscribe(appId, ws as any);
            fastify.log.info(`🔌 Unsubscribed [${appId}] from Event Router.`);
        });

        ws.on('error', (err: Error) => {
            fastify.log.error(`❌ WS Error for [${appId}]: ${err.message}`);
            ws.close();
        });
    });
};

export default wsRoutes;
