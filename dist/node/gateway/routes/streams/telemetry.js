import { Transform } from 'stream';
export default async function (fastify) {
    fastify.get('/telemetry', (request, reply) => {
        const { corvus } = fastify;
        // Set headers for SSE
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        // [AMENDMENT C] Backpressure & Telemetry Pipeline
        const sseStream = new Transform({
            writableObjectMode: true,
            transform(chunk, encoding, callback) {
                // SSE Format: data: <json>\n\n
                const data = `data: ${JSON.stringify(chunk)}\n\n`;
                this.push(data);
                callback();
            }
        });
        // Pipe the corvus events to the SSE stream
        const onTelemetry = (data) => {
            if (!sseStream.writableEnded) {
                // Check backpressure
                const canWrite = sseStream.write(data);
                if (!canWrite) {
                    // [Ω] Optional: Dropping non-critical frames if needed.
                    // For now, we trust the Transform buffer.
                }
            }
        };
        corvus.on('telemetry', onTelemetry);
        request.raw.on('close', () => {
            corvus.off('telemetry', onTelemetry);
            sseStream.end();
        });
        reply.send(sseStream);
    });
}
