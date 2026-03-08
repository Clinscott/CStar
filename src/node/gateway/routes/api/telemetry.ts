import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

const TraceSchema = Type.Object({
    mission_id: Type.String(),
    file_path: Type.String(),
    target_metric: Type.String(),
    initial_score: Type.Number(),
    final_score: Type.Number(),
    justification: Type.String(),
    status: Type.String(),
    timestamp: Type.Number()
});

const FlareSchema = Type.Object({
    path: Type.String(),
    agent: Type.String(),
    action: Type.String(),
    timestamp: Type.Number()
});

/**
 * [Ω] THE TELEMETRY GATEWAY
 * Purpose: Receive telemetry pulses from Python skills and broadcast them via SSE.
 */
export default async function (fastify: FastifyInstance) {
    
    fastify.post(
        '/telemetry/trace',
        { schema: { body: TraceSchema } },
        async (request, reply) => {
            const { corvus } = fastify;
            const trace = request.body as any;
            
            // Broadcast to all SSE listeners
            corvus.emit('telemetry', { type: 'TRACE', data: trace });
            
            return { status: 'recorded' };
        }
    );

    fastify.post(
        '/telemetry/flare',
        { schema: { body: FlareSchema } },
        async (request, reply) => {
            const { corvus } = fastify;
            const flare = request.body as any;
            
            // Broadcast to all SSE listeners
            corvus.emit('telemetry', { type: 'FLARE', data: flare });
            
            return { status: 'dispatched' };
        }
    );

    fastify.get('/telemetry/ping', async () => {
        return { status: 'pong', timestamp: Date.now() };
    });
}
