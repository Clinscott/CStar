import { failRetiredGateway } from '../../../retired_gateway.js';

/** Retired WebSocket event route. */
export default function retiredWebSocketEventsRoute(_fastify?: unknown): never {
    return failRetiredGateway();
}
