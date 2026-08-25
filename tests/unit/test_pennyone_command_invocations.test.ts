import test from 'node:test';
import assert from 'node:assert';

import {
    buildPennyOneInvocation,
    PENNYONE_COMMAND_RETIRED_ERROR,
} from '../../src/node/core/commands/pennyone.js';

test('legacy PennyOne invocation builder cannot construct an execution payload', () => {
    for (const options of [
        { scan: '.' },
        { import: 'https://user:password@example.invalid/repo.git' },
        { clean: true },
        { learn: 'memory:synthetic' },
    ]) {
        assert.throws(
            () => buildPennyOneInvocation(options, '/home/synthetic/private'),
            new RegExp(PENNYONE_COMMAND_RETIRED_ERROR),
        );
    }
});
