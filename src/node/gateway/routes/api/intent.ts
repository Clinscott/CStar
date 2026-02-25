import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

/**
 * [AMENDMENT B] Zero-Trust Input Validation
 * Strict TypeBox schema to validate IntentPayload at the edge.
 */
const IntentSchema = Type.Object({
    system_meta: Type.Record(Type.String(), Type.Any()),
    intent_raw: Type.String(),
    intent_normalized: Type.String(),
    target_workflow: Type.String(),
    extracted_entities: Type.Optional(Type.Record(Type.String(), Type.Any()))
});

type IntentType = Static<typeof IntentSchema>;

export default async function (fastify: FastifyInstance) {
    fastify.post<{ Body: IntentType }>(
        '/intent',
        {
            schema: {
                body: IntentSchema,
                response: {
                    202: Type.Object({ status: Type.String(), message: Type.String() }),
                    503: Type.Object({ error: Type.String() })
                }
            }
        },
        async (request, reply) => {
            const { corvus } = fastify;

            if (!corvus.getStatus()) {
                return reply.code(503).send({ error: 'Daemon offline' });
            }

            try {
                const { CognitiveRouter } = await import('../../../core/CognitiveRouter.js');
                const router = CognitiveRouter.getInstance();

                // [TIERED ROUTING] Pass intent to the controller for cognitive evaluation
                await router.routeIntent(request.body as any, corvus);

                return reply.code(202).send({
                    status: 'accepted',
                    message: `Intent ${request.body.intent_normalized} routed via CognitiveRouter.`
                });
            } catch (err: any) {
                fastify.log.error(`[IntentRoute] Routing Error: ${err.message}`);
                return reply.code(500).send({ error: err.message });
            }
        }
    );
}
