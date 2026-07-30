import { failRetiredGateway } from '../../../retired_gateway.js';

/** Retired HTTP intent route. */
export default function retiredIntentRoute(_fastify?: unknown): never {
    return failRetiredGateway();
}
