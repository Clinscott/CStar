import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import {
    ORACLE_COMMAND_RETIRED_ERROR,
    registerOracleCommand,
} from '../../src/node/core/commands/oracle.ts';

describe('retired Oracle command', () => {
    it('fails before resolving workspace, provider, database, filesystem, or callbacks', async () => {
        const effects = { workspace: 0, provider: 0, database: 0, filesystem: 0 };
        const program = new Command().exitOverride();
        registerOracleCommand(program, () => {
            effects.workspace += 1;
            return '/synthetic/cstar';
        }, {
            hostTextInvoker: (() => {
                effects.provider += 1;
                throw new Error('provider callback forbidden');
            }) as never,
            databaseFactory: (() => {
                effects.database += 1;
                throw new Error('database callback forbidden');
            }) as never,
            fileSystem: new Proxy({}, {
                get: () => {
                    effects.filesystem += 1;
                    throw new Error('filesystem callback forbidden');
                },
            }),
        });

        await assert.rejects(
            program.parseAsync([
                'node', 'test', 'oracle', 'prompt', '--provider', 'gemini', '--out', '/tmp/forbidden',
            ]),
            new RegExp(ORACLE_COMMAND_RETIRED_ERROR),
        );
        assert.deepEqual(effects, { workspace: 0, provider: 0, database: 0, filesystem: 0 });
    });
});
