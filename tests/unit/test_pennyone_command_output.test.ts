import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import {
    PENNYONE_COMMAND_RETIRED_ERROR,
    registerPennyOneCommand,
} from '../../src/node/core/commands/pennyone.js';
import type { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.js';

class RejectDispatchPort implements RuntimeDispatchPort {
    public calls = 0;
    public async dispatch<T>(_invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('dispatch forbidden');
    }
}

describe('retired PennyOne command output', () => {
    it('fails before dispatch, workspace resolution, stdout, or JSON environment mutation', async () => {
        const dispatch = new RejectDispatchPort();
        let workspaceResolutions = 0;
        const beforeJson = process.env.CSTAR_JSON_OUTPUT;
        const program = new Command().exitOverride();
        registerPennyOneCommand(program, () => {
            workspaceResolutions += 1;
            return '/synthetic';
        }, dispatch);

        await assert.rejects(
            program.parseAsync(['node', 'test', 'pennyone', '--status', '.', '--json']),
            new RegExp(PENNYONE_COMMAND_RETIRED_ERROR),
        );
        assert.equal(dispatch.calls, 0);
        assert.equal(workspaceResolutions, 0);
        assert.equal(process.env.CSTAR_JSON_OUTPUT, beforeJson);
    });
});
