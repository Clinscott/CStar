import { failRetiredGateway } from '../../../retired_gateway.js';

/** Retired server-sent-event telemetry route. */
export default function retiredStreamTelemetryRoute(_fastify?: unknown): never {
    return failRetiredGateway();
}
