import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

const MimirThinkSchema = Type.Object({
    query: Type.String(),
    system_prompt: Type.Optional(Type.String()),
    stream: Type.Optional(Type.Boolean())
});

/**
 * [Ω] THE MIMIR GATEWAY (v3.0 - Keyless)
 * Purpose: Channel intelligence requests from Skills to the Host Agent (Shaman).
 * Mandate: No API Keys. Use local environment sampling.
 */
export default async function (fastify: FastifyInstance) {
    
    fastify.post(
        '/mimir/think',
        {
            schema: {
                body: MimirThinkSchema,
                response: {
                    200: Type.Object({ text: Type.String(), reply: Type.String() }),
                    500: Type.Object({ error: Type.String() })
                }
            }
        },
        async (request, reply) => {
            const { query, system_prompt } = request.body as any;
            const { corvus } = fastify;

            try {
                /**
                 * [🔱] THE SYNAPTIC ASCENSION
                 * We bypass the SDK and use the MCP Sampling capability.
                 * This asks the Host (Gemini CLI) to perform the LLM strike.
                 */
                fastify.log.info('[Mimir] Ascending request to Host Agent (Sampling)...');
                
                const result = await corvus.sampleMind({
                    prompt: query,
                    systemPrompt: system_prompt,
                    maxTokens: 2048
                });

                if (!result || !result.text) {
                    throw new Error('Host Agent (One Mind) returned an empty response.');
                }

                return { text: result.text, reply: result.text };
            } catch (err: any) {
                fastify.log.error(`[MimirThink] Sampling Error: ${err.message}`);
                return reply.code(500).send({ error: `Host Sampling Failed: ${err.message}` });
            }
        }
    );

    fastify.get(
        '/mimir/intent',
        async (request, reply) => {
            const { path: sectorPath } = request.query as { path: string };
            const { corvus } = fastify;
            
            try {
                const intent = await corvus.getWellIntent(sectorPath);
                return { intent: intent || 'The Well is silent for this sector.' };
            } catch (err: any) {
                return { intent: `Error retrieving intent: ${err.message}` };
            }
        }
    );
}
