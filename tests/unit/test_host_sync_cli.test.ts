import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPipelineCliEnv, PipelineCli } from '../../src/node/sync/cli.js';

describe('host sync worker — pipeline CLI environment', () => {
    it('passes only the allowlisted child environment', () => {
        const env = buildPipelineCliEnv({
            PATH: '/usr/bin',
            HOME: '/home/morderith',
            CSTAR_GH_MODE: 'mock',
            CSTAR_GH_MOCK_STORE: '/tmp/gh-mock.json',
            CSTAR_MONGO_URI: 'mongodb+srv://secret',
            OPENAI_API_KEY: 'secret',
            RANDOM_VALUE: 'drop-me',
        });

        assert.equal(env.PATH, '/usr/bin');
        assert.equal(env.HOME, '/home/morderith');
        assert.equal(env.CSTAR_GH_MODE, 'mock');
        assert.equal(env.CSTAR_GH_MOCK_STORE, '/tmp/gh-mock.json');
        assert.equal(env.CSTAR_MONGO_URI, undefined);
        assert.equal(env.OPENAI_API_KEY, undefined);
        assert.equal(env.RANDOM_VALUE, undefined);
    });

    it('filters an explicitly supplied PipelineCli env before execFile receives it', () => {
        const cli = new PipelineCli({
            consoleDir: '/tmp/cstar-console',
            env: {
                PATH: '/usr/bin',
                HOME: '/home/morderith',
                CSTAR_MONGO_URI: 'mongodb+srv://secret',
                MINIMAX_API_KEY: 'secret',
            },
        });

        const internals = cli as unknown as { env: NodeJS.ProcessEnv };
        assert.equal(internals.env.PATH, '/usr/bin');
        assert.equal(internals.env.HOME, '/home/morderith');
        assert.equal(internals.env.CSTAR_MONGO_URI, undefined);
        assert.equal(internals.env.MINIMAX_API_KEY, undefined);
    });
});
