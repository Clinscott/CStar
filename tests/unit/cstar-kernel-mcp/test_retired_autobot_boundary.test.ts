import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
    AUTOBOT_RETIRED_ERROR,
    handleAutobot,
} from '../../../src/tools/cstar-kernel-mcp/tools/autobot.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

describe('retired AutoBot boundary', () => {
    it('fails with one stable error under every former activation flag without side effects', async () => {
        const previousEnable = process.env.CSTAR_KERNEL_ENABLE_AUTOBOT;
        const previousDelegated = process.env.HERMES_AUTOBOT_DELEGATED;
        const touched = mock.fn(() => {
            throw new Error('retired AutoBot attempted a forbidden side effect');
        });

        mock.method(fs.promises, 'mkdtemp', touched);
        mock.method(fs.promises, 'writeFile', touched);
        mock.method(childProcess, 'spawnSync', touched);

        try {
            for (const [enable, delegated] of [
                ['0', '0'],
                ['0', '1'],
                ['1', '0'],
                ['1', '1'],
            ]) {
                process.env.CSTAR_KERNEL_ENABLE_AUTOBOT = enable;
                process.env.HERMES_AUTOBOT_DELEGATED = delegated;
                const response = await handleAutobot({
                    intent: 'must remain retired',
                    project_root: '/synthetic',
                    payload: { model: 'forbidden' },
                });

                assert.equal(response.isError, true);
                assert.deepEqual(JSON.parse(response.content[0].text), {
                    error_code: AUTOBOT_RETIRED_ERROR,
                    error: AUTOBOT_RETIRED_ERROR,
                });
            }
            assert.equal(touched.mock.callCount(), 0);
        } finally {
            if (previousEnable === undefined) delete process.env.CSTAR_KERNEL_ENABLE_AUTOBOT;
            else process.env.CSTAR_KERNEL_ENABLE_AUTOBOT = previousEnable;
            if (previousDelegated === undefined) delete process.env.HERMES_AUTOBOT_DELEGATED;
            else process.env.HERMES_AUTOBOT_DELEGATED = previousDelegated;
            mock.restoreAll();
        }
    });

    it('contains no latent runtime, provider, Hall, source, or callback path', () => {
        const source = fs.readFileSync(
            path.join(PROJECT_ROOT, 'src', 'tools', 'cstar-kernel-mcp', 'tools', 'autobot.ts'),
            'utf-8',
        );
        for (const forbidden of [
            'process.env',
            'node:child_process',
            'node:fs',
            'node:os',
            'node:path',
            'spawn',
            'import(',
            'delegate.py',
            'registry',
            'Hall',
            'callback',
        ]) {
            assert.equal(source.includes(forbidden), false, `latent AutoBot source contains ${forbidden}`);
        }
    });
});
