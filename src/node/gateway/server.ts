import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import corvusPlugin from './plugins/corvus.js';
import intentRoute from './routes/api/intent.js';
import mimirRoute from './routes/api/mimir.js';
import apiTelemetryRoute from './routes/api/telemetry.js';
import streamTelemetryRoute from './routes/streams/telemetry.js';

// Load environment
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

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
await fastify.register(mimirRoute, { prefix: '/api' });
await fastify.register(apiTelemetryRoute, { prefix: '/api' });
await fastify.register(streamTelemetryRoute, { prefix: '/streams' });

// Health Check
fastify.get('/health', async () => {
    return { status: 'ok', engine: fastify.corvus.getStatus() ? 'online' : 'offline' };
});

/**
 * [Ω] EXECUTION ENTRYPOINT
 */
const start = async () => {
    try {
        // [🔱] THE BIFROST GATE: Enforcing Port 4000 for the Hall of Records
        const PORT = parseInt(process.env.PORT || '4000');
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        console.error(`[Ω]: "Sovereign Gateway online. Bifrost Gate established on port ${PORT}."`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
