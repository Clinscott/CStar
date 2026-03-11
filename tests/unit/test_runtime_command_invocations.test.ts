import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import { registerStartCommand } from '../../src/node/core/commands/start.ts';
import { registerRavenCommand } from '../../src/node/core/commands/ravens.ts';
import { registerPennyOneCommand } from '../../src/node/core/commands/pennyone.ts';
import { buildDynamicCommandInvocation } from '../../src/node/core/commands/dispatcher.ts';
import { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.ts';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocation: WeaveInvocation<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.invocation = invocation as WeaveInvocation<unknown>;
        return {
            weave_id: invocation.weave_id,
            status: 'SUCCESS',
            output: 'captured',
        };
    }
}

describe('Command shells convert CLI args into runtime invocations (CS-P1-01)', () => {
    it('start command dispatches a structured start weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerStartCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'start',
            'src/index.ts',
            '--task',
            'Refactor entrypoint',
            '--ledger',
            'C:\\temp\\ledger',
            '--loki',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:start',
            payload: {
                target: 'src/index.ts',
                task: 'Refactor entrypoint',
                ledger: 'C:\\temp\\ledger',
                loki: true,
                debug: undefined,
                verbose: undefined,
            },
            target: {
                domain: 'brain',
                workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            },
            session: {
                mode: 'cli',
                interactive: true,
            },
        });
    });

    it('ravens command dispatches through the shared ravens weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerRavenCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'ravens',
            'start',
            '--shadow-forge',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:ravens',
            payload: {
                action: 'start',
                shadow_forge: true,
            },
            target: {
                domain: 'brain',
                workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            },
            session: {
                mode: 'cli',
                interactive: true,
            },
        });
    });

    it('ravens cycle command dispatches through the shared ravens weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerRavenCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'ravens',
            'cycle',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:ravens',
            payload: {
                action: 'cycle',
                shadow_forge: undefined,
            },
            target: {
                domain: 'brain',
                workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            },
            session: {
                mode: 'cli',
                interactive: true,
            },
        });
    });

    it('pennyone command dispatches search through the shared pennyone weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--search',
            'mimir well',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'search',
                query: 'mimir well',
                path: '.',
            },
            target: {
                domain: 'brain',
                workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            },
            session: {
                mode: 'cli',
                interactive: true,
            },
        });
    });

    it('chant fallback builds the chant weave invocation', () => {
        assert.deepStrictEqual(
            buildDynamicCommandInvocation(
                'chant',
                ['scan the hall'],
                'C:\\Users\\Craig\\Corvus\\CorvusStar',
                'C:\\Users\\Craig\\Corvus\\CorvusStar',
            ),
            {
                weave_id: 'weave:chant',
                payload: {
                    query: 'scan the hall',
                    project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    source: 'cli',
                },
                target: {
                    domain: 'brain',
                    workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                    requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
        );
    });
});
