import { failRetiredGateway } from '../../retired_gateway.js';

/** Retired Fastify plugin. Registration is always terminal and side-effect free. */
export default function retiredCorvusPlugin(_fastify?: unknown): never {
    return failRetiredGateway();
}
