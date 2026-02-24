import Fastify from 'fastify';
import cors from '@fastify/cors';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import corvusPlugin from './plugins/corvus.js';
import intentRoute from './routes/api/intent.js';
import telemetryRoute from './routes/streams/telemetry.js';

const fastify = Fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    },
}).withTypeProvider<TypeBoxTypeProvider>();

// Register Core Plugins
await fastify.register(cors, { origin: '*' });

// Register Corvus Singleton
await fastify.register(corvusPlugin);

// Register Routes
await fastify.register(intentRoute, { prefix: '/api' });
await fastify.register(telemetryRoute, { prefix: '/streams' });

// Health Check
fastify.get('/health', async () => {
    return { status: 'ok', engine: fastify.corvus.getStatus() ? 'online' : 'offline' };
});

/**
 * [Ω] EXECUTION ENTRYPOINT
 */
const start = async () => {
    try {
        const PORT = parseInt(process.env.PORT || '3000');
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
