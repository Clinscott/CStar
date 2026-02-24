import { EventManager } from '../../../core/EventManager.js';
/**
 * [Ω] The Universal Event Router WebSocket Endpoint
 * Handles tenant-aware subscriptions and mobile-edge stability.
 */
const wsRoutes = async (fastify) => {
    fastify.get('/connect', { websocket: true }, (connection, req) => {
        // 1. Mandatory app_id Extraction
        const appId = req.query?.app_id;
        if (!appId) {
            fastify.log.warn('⚠️ Rejected WebSocket: Missing app_id');
            connection.socket.close(1008, 'Missing app_id');
            return;
        }
        const eventManager = EventManager.getInstance();
        const ws = connection.socket;
        // 2. Heartbeat Termination Flag
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        eventManager.subscribe(appId, ws);
        fastify.log.info(`📡 Subscribed [${appId}] to Event Router.`);
        // 3. 30s Heartbeat Check (Enforcement)
        const interval = setInterval(() => {
            if (ws.isAlive === false) {
                fastify.log.warn(`💀 Terminating dead connection for [${appId}].`);
                clearInterval(interval);
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        }, 30000);
        ws.on('close', () => {
            clearInterval(interval);
            eventManager.unsubscribe(appId, ws);
            fastify.log.info(`🔌 Unsubscribed [${appId}] from Event Router.`);
        });
        ws.on('error', (err) => {
            fastify.log.error(`❌ WS Error for [${appId}]: ${err.message}`);
            ws.close();
        });
    });
};
export default wsRoutes;
