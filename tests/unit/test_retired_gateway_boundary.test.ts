import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RETIRED_GATEWAY_ERROR } from '../../src/node/retired_gateway.js';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const TERMINAL_MODULES = [
    'src/node/gateway/plugins/corvus.ts',
    'src/node/gateway/routes/api/intent.ts',
    'src/node/gateway/routes/api/mimir.ts',
    'src/node/gateway/routes/api/telemetry.ts',
    'src/node/gateway/routes/streams/telemetry.ts',
    'src/node/gateway/routes/ws/events.ts',
    'src/node/core/CognitiveRouter.ts',
    'src/node/core/CorvusProcess.ts',
    'src/node/cortex_link.ts',
];

describe('retired gateway source contract', () => {
    it('keeps every historical gateway surface on the shared terminal', () => {
        for (const relativePath of TERMINAL_MODULES) {
            const source = readFileSync(path.join(ROOT, relativePath), 'utf8');
            assert.match(source, /failRetiredGateway/);
        }
    });

    it('removes environment, listener, provider, process, filesystem, and callback paths', () => {
        const server = readFileSync(path.join(ROOT, 'src/node/gateway/server.ts'), 'utf8');
        const router = readFileSync(path.join(ROOT, 'src/node/core/CognitiveRouter.ts'), 'utf8');
        const processSource = readFileSync(path.join(ROOT, 'src/node/core/CorvusProcess.ts'), 'utf8');
        const cortex = readFileSync(path.join(ROOT, 'src/node/cortex_link.ts'), 'utf8');

        assert.doesNotMatch(server, /dotenv|Fastify|\.listen\(|process\.env|cors/);
        assert.doesNotMatch(router, /fetch\(|Ollama|EventManager|dispatchIntent\(payload/);
        assert.doesNotMatch(processSource, /mimir|CortexLink|EventManager|\.emit\(|dispatchExecutor/);
        assert.doesNotMatch(cortex, /execa|ts-morph|getPythonPath|new Project|process\.env/);
    });

    it('uses the exact stable error and names the canonical replacement', () => {
        assert.equal(RETIRED_GATEWAY_ERROR, 'legacy_gateway_retired_use_cstar_kernel');
    });
});
