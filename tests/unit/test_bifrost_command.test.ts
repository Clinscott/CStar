import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import {
    BIFROST_COMMAND_RETIRED_ERROR,
    buildStaticGuide,
    parseBifrostGuide,
    registerBifrostCommand,
    renderBifrostGuide,
    resolveBifrostGuide,
} from '../../src/node/core/commands/bifrost.js';

describe('retired Bifrost command', () => {
    it('keeps static guide parsing and rendering pure', () => {
        const guide = buildStaticGuide();
        const parsed = parseBifrostGuide(JSON.stringify(guide));
        assert.deepEqual(parsed, guide);
        assert.match(renderBifrostGuide(parsed), /typed cstar-kernel MCP inventory/);
    });

    it('fails the compatibility resolver before provider or root callbacks', async () => {
        let providerCalls = 0;
        let rootCalls = 0;
        await assert.rejects(resolveBifrostGuide({}, {
            projectRoot: () => {
                rootCalls += 1;
                return '/synthetic';
            },
            hostTextInvoker: (() => {
                providerCalls += 1;
                throw new Error('provider forbidden');
            }) as never,
        }, true), new RegExp(BIFROST_COMMAND_RETIRED_ERROR));
        assert.deepEqual({ providerCalls, rootCalls }, { providerCalls: 0, rootCalls: 0 });
    });

    it('fails direct registration before provider callbacks', async () => {
        let providerCalls = 0;
        const program = new Command().exitOverride();
        registerBifrostCommand(program, {
            hostTextInvoker: (() => {
                providerCalls += 1;
                throw new Error('provider forbidden');
            }) as never,
        });
        await assert.rejects(
            program.parseAsync(['node', 'test', 'bifrost', '--host-guide']),
            new RegExp(BIFROST_COMMAND_RETIRED_ERROR),
        );
        assert.equal(providerCalls, 0);
    });
});
