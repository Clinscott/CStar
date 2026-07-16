import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runExplicitHostSupervision } from '../../src/node/core/runtime/host_supervision.js';

describe('explicit host supervision gate', () => {
    it('does not invoke a provider unless authority is exact boolean true', async () => {
        let calls = 0;
        const result = await runExplicitHostSupervision({
            enabled: 'true',
            provider: 'codex',
            label: 'synthetic',
            invoke: async () => {
                calls += 1;
                return '{}';
            },
            parse: () => ({ action: 'execute_now' }),
        });

        assert.equal(result.requested, false);
        assert.equal(result.requestDispatched, false);
        assert.equal(calls, 0);
    });

    it('fails before dispatch when explicit supervision has no provider', async () => {
        const result = await runExplicitHostSupervision({
            enabled: true,
            provider: null,
            label: 'synthetic',
            invoke: async () => '{"action":"execute_now"}',
            parse: () => ({ action: 'execute_now' }),
        });

        assert.match(result.error ?? '', /host_supervision_provider_unavailable/);
        assert.equal(result.requestDispatched, false);
    });

    it('does not recover from invalid or thrown provider output', async () => {
        const invalid = await runExplicitHostSupervision({
            enabled: true,
            provider: 'codex',
            label: 'synthetic',
            invoke: async () => 'invalid',
            parse: () => null,
        });
        assert.match(invalid.error ?? '', /host_supervision_invalid_response/);
        assert.equal(invalid.requestDispatched, true);

        const failed = await runExplicitHostSupervision({
            enabled: true,
            provider: 'codex',
            label: 'synthetic',
            invoke: async () => { throw 'synthetic failure'; },
            parse: () => null,
        });
        assert.match(failed.error ?? '', /synthetic failure/);
        assert.equal(failed.requestDispatched, true);
    });
});
