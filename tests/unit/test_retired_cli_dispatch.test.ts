import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

import {
    buildDynamicCommandInvocation,
    registerDispatcher,
    resolveRegistryCommandActivation,
} from '../../src/node/core/commands/dispatcher.js';
import type {
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.js';
import type { SkillBead } from '../../src/node/core/skills/types.js';

class TrapDispatchPort implements RuntimeDispatchPort {
    public calls = 0;

    public async dispatch<T>(
        _invocation: WeaveInvocation<T> | SkillBead<T>,
    ): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('runtime dispatch must not start');
    }
}

describe('retired dynamic CLI boundary', () => {
    it('treats an underspecified registry entry as retired compatibility', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-cli-compatibility-'));
        try {
            fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
            fs.writeFileSync(
                path.join(root, '.agents', 'skill_registry.json'),
                JSON.stringify({ entries: { underspecified: {} } }),
            );

            const activation = resolveRegistryCommandActivation(
                'underspecified',
                [],
                root,
                root,
            );

            assert.equal(activation.kind, 'blocked');
            if (activation.kind === 'blocked') {
                assert.equal(activation.surface, 'compatibility');
                assert.match(activation.error, /retired compatibility surface.*cstar-kernel/i);
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    for (const command of ['evolve', 'forge', 'legacy-script']) {
        it(`rejects ${command} before constructing a runtime invocation`, () => {
            assert.throws(
                () => buildDynamicCommandInvocation(command, [], '/synthetic', '/synthetic'),
                /legacy dynamic command.*(?:retired|unsupported)/i,
            );
        });

        it(`does not dispatch the unknown CLI route ${command}`, async () => {
            const port = new TrapDispatchPort();
            const program = new Command();
            const originalExitCode = process.exitCode;
            const originalError = console.error;
            const errors: string[] = [];
            process.exitCode = undefined;
            console.error = (...args: unknown[]) => {
                errors.push(args.map(String).join(' '));
            };

            try {
                registerDispatcher(program, '/synthetic', port);
                await program.parseAsync(['node', 'cstar', command]);
                assert.equal(port.calls, 0);
                assert.equal(process.exitCode, 1);
                assert.match(errors.join('\n'), /legacy dynamic command.*retired|dynamic runtime execution is disabled/i);
            } finally {
                process.exitCode = originalExitCode;
                console.error = originalError;
            }
        });
    }
});
