import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { CorvusProcess } from '../../core/CorvusProcess.js';

declare module 'fastify' {
    interface FastifyInstance {
        corvus: CorvusProcess;
    }
}

const corvusPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const corvus = new CorvusProcess();

    fastify.addHook('onReady', async () => {
        fastify.log.info('🔱 Initializing Corvus kernel bridge...');
        await corvus.boot();
    });

    fastify.addHook('onClose', async (instance) => {
        instance.log.warn('⚠️ Shutting down Corvus Gateway. Releasing kernel bridge...');
        await corvus.terminate();
    });

    fastify.decorate('corvus', corvus);
};

export default fp(corvusPlugin, {
    name: 'corvus',
    fastify: '5.x' // Assuming Fastify 5 for alignment with current standards
});


