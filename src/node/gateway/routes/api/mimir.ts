import { failRetiredGateway } from '../../../retired_gateway.js';

/** Retired Mimir HTTP route. Canonical intelligence remains kernel-owned. */
export default function retiredMimirRoute(_fastify?: unknown): never {
    return failRetiredGateway();
}
