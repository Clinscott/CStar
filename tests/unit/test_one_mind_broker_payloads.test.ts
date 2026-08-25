import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import {
    ONE_MIND_COMMAND_RETIRED_ERROR,
    registerOneMindCommand,
} from '../../src/node/core/commands/one-mind.js';

describe('retired One Mind command', () => {
    it('fails before resolving workspace, reading Hall, registering signals, or invoking fulfillment', async () => {
        let workspaceResolutions = 0;
        const beforeSigint = process.listenerCount('SIGINT');
        const beforeSigterm = process.listenerCount('SIGTERM');
        const program = new Command().exitOverride();
        registerOneMindCommand(program, () => {
            workspaceResolutions += 1;
            return '/synthetic/cstar';
        });

        await assert.rejects(
            program.parseAsync(['node', 'test', 'one-mind', 'serve', '--poll-ms', '1']),
            new RegExp(ONE_MIND_COMMAND_RETIRED_ERROR),
        );

        assert.equal(workspaceResolutions, 0);
        assert.equal(process.listenerCount('SIGINT'), beforeSigint);
        assert.equal(process.listenerCount('SIGTERM'), beforeSigterm);
    });
});
