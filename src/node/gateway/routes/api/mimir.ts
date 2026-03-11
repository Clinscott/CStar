import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

const IntelligenceCallerSchema = Type.Object({
    source: Type.String(),
    persona: Type.Optional(Type.String()),
    sector_path: Type.Optional(Type.String()),
    workflow: Type.Optional(Type.String()),
});

const IntelligenceTraceSchema = Type.Object({
    correlation_id: Type.String(),
    transport_mode: Type.Union([Type.Literal('host_session'), Type.Literal('synapse_db')]),
    cached: Type.Optional(Type.Boolean()),
});

const IntelligenceResponseSchema = Type.Object({
    status: Type.Union([Type.Literal('success'), Type.Literal('error')]),
    raw_text: Type.Optional(Type.String()),
    parsed_data: Type.Optional(Type.Unknown()),
    error: Type.Optional(Type.String()),
    trace: IntelligenceTraceSchema,
});

const MimirThinkSchema = Type.Object({
    prompt: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    system_prompt: Type.Optional(Type.String()),
    transport_mode: Type.Optional(Type.Union([
        Type.Literal('auto'),
        Type.Literal('host_session'),
        Type.Literal('synapse_db'),
    ])),
    correlation_id: Type.Optional(Type.String()),
    caller: Type.Optional(IntelligenceCallerSchema),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    stream: Type.Optional(Type.Boolean()),
});

const MimirIntentQuerySchema = Type.Object({
    path: Type.String(),
});

/**
 * [Ω] THE MIMIR GATEWAY
 * Purpose: Expose the canonical intelligence bridge to local clients.
 */
export default async function (fastify: FastifyInstance) {
    fastify.post(
        '/mimir/think',
        {
            schema: {
                body: MimirThinkSchema,
                response: {
                    200: IntelligenceResponseSchema,
                    400: IntelligenceResponseSchema,
                    502: IntelligenceResponseSchema,
                },
            },
        },
        async (request, reply) => {
            const body = request.body as {
                prompt?: string;
                query?: string;
                system_prompt?: string;
                transport_mode?: 'auto' | 'host_session' | 'synapse_db';
                correlation_id?: string;
                caller?: {
                    source: string;
                    persona?: string;
                    sector_path?: string;
                    workflow?: string;
                };
                metadata?: Record<string, unknown>;
            };
            const prompt = body.prompt ?? body.query;

            if (!prompt) {
                return reply.code(400).send({
                    status: 'error',
                    error: 'A prompt or query field is required.',
                    trace: {
                        correlation_id: body.correlation_id ?? 'validation_error',
                        transport_mode: 'host_session',
                    },
                });
            }

            const result = await fastify.corvus.requestIntelligence({
                prompt,
                system_prompt: body.system_prompt,
                transport_mode: body.transport_mode,
                correlation_id: body.correlation_id,
                caller: body.caller,
                metadata: body.metadata,
            });

            if (result.status === 'error') {
                return reply.code(502).send(result);
            }

            return result;
        },
    );

    fastify.get(
        '/mimir/intent',
        {
            schema: {
                querystring: MimirIntentQuerySchema,
                response: {
                    200: IntelligenceResponseSchema,
                    400: IntelligenceResponseSchema,
                    502: IntelligenceResponseSchema,
                },
            },
        },
        async (request, reply) => {
            const { path: sectorPath } = request.query as { path: string };
            if (!sectorPath) {
                return reply.code(400).send({
                    status: 'error',
                    error: 'A path query parameter is required.',
                    trace: {
                        correlation_id: 'validation_error',
                        transport_mode: 'host_session',
                    },
                });
            }

            const result = await fastify.corvus.requestSectorIntent(sectorPath);
            if (result.status === 'error') {
                return reply.code(502).send(result);
            }
            return result;
        },
    );
}
