import { failRetiredGateway } from '../../../retired_gateway.js';

/** Retired telemetry mutation route. */
export default function retiredApiTelemetryRoute(_fastify?: unknown): never {
    return failRetiredGateway();
}
