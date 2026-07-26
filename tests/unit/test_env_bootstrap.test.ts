import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { synchronizeEnvContent } from '../../scripts/env_bootstrap.js';

describe('environment bootstrap retirement', () => {
    it('removes retired Gemini flags while preserving current settings', () => {
        const result = synchronizeEnvContent(
            [
                'KEEP_ME=present',
                'GEMINI_CLI_ACTIVE=true',
                'export GEMINI_CLI=1',
                'GEMINI_CLI_SUBAGENTS=true',
                '',
            ].join('\n'),
            {
                CSTAR_PROJECT_ROOT: '/workspace/CStar',
                PYTHONPATH: '/workspace/CStar',
            },
        );

        assert.equal(result.updated, true);
        assert.doesNotMatch(result.content, /GEMINI_CLI/);
        assert.match(result.content, /^KEEP_ME=present$/m);
        assert.match(result.content, /^CSTAR_PROJECT_ROOT=\/workspace\/CStar$/m);
        assert.match(result.content, /^PYTHONPATH=\/workspace\/CStar$/m);
    });

    it('is stable after synchronization', () => {
        const content = [
            'KEEP_ME=present',
            'CSTAR_PROJECT_ROOT=/workspace/CStar',
            'PYTHONPATH=/workspace/CStar',
            '',
        ].join('\n');

        const result = synchronizeEnvContent(content, {
            CSTAR_PROJECT_ROOT: '/workspace/CStar',
            PYTHONPATH: '/workspace/CStar',
        });

        assert.equal(result.updated, false);
        assert.equal(result.content, content);
    });
});
