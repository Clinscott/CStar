import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    renderBifrostGuide,
    resolveBifrostGuide,
} from '../../src/node/core/commands/bifrost.js';

describe('Bifrost bridge guidance', () => {
    it('uses host-supervised bridge guidance when a host session is active', async () => {
        const result = await resolveBifrostGuide(
            { CODEX_SHELL: '1' } as NodeJS.ProcessEnv,
            {
                hostTextInvoker: async () => ({
                    provider: 'codex',
                    response: {} as any,
                    text: JSON.stringify({
                        summary: 'Bridge guidance from host.',
                        primary_servers: ['pennyone', 'corvus-control'],
                        recommended_path: 'Prefer MCP over manual CLI replication.',
                    }),
                }),
                projectRoot: () => '/tmp/corvus',
            },
        );

        assert.equal(result.delegated, true);
        assert.equal(result.provider, 'codex');
        assert.equal(result.guide.summary, 'Bridge guidance from host.');
        assert.match(renderBifrostGuide(result.guide), /Prefer MCP over manual CLI replication/);
    });

    it('falls back to static guidance when no host provider is active', async () => {
        const result = await resolveBifrostGuide(
            { CORVUS_HOST_SESSION_ACTIVE: 'false' } as NodeJS.ProcessEnv,
            {
                projectRoot: () => '/tmp/corvus',
            },
        );

        assert.equal(result.delegated, false);
        assert.equal(result.provider, null);
        assert.match(result.guide.summary, /PennyOne and corvus-control/);
    });
});
