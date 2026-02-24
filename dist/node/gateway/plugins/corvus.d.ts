import { FastifyPluginAsync } from 'fastify';
import { CorvusProcess } from '../../core/CorvusProcess.js';
declare module 'fastify' {
    interface FastifyInstance {
        corvus: CorvusProcess;
    }
}
declare const _default: FastifyPluginAsync;
export default _default;
