import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import { registerStartCommand } from '../../src/node/core/commands/start.ts';
import { registerRavenCommand } from '../../src/node/core/commands/ravens.ts';
import { registerPennyOneCommand } from '../../src/node/core/commands/pennyone.ts';
import {
    buildDynamicCommandInvocation,
    parseChantSessionDirective,
    registerDispatcher,
    shouldAutoResumeChantSession,
} from '../../src/node/core/commands/dispatcher.ts';
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
        const invocation = buildDynamicCommandInvocation(
            'chant',
            ['scan the hall'],
            'C:\\Users\\Craig\\Corvus\\CorvusStar',
            'C:\\Users\\Craig\\Corvus\\CorvusStar',
        );

        assert.equal(invocation.weave_id, 'weave:chant');
        assert.deepStrictEqual(invocation.payload, {
            query: 'scan the hall',
            project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            source: 'cli',
        });
        assert.deepStrictEqual(invocation.target, {
            domain: 'brain',
            workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
        });
        assert.equal(invocation.session?.mode, 'cli');
        assert.equal(invocation.session?.interactive, true);
        if (invocation.session?.session_id) {
            assert.match(invocation.session.session_id, /^chant-session:/);
        }
    });

    it('does not auto-resume chant for a fresh detailed planning request', () => {
        assert.equal(shouldAutoResumeChantSession(['plan', 'a', 'fresh', 'runtime', 'improvement']), false);
        assert.deepStrictEqual(
            parseChantSessionDirective(['--new-session', 'plan', 'a', 'fresh', 'runtime', 'improvement']),
            {
                queryArgs: ['plan', 'a', 'fresh', 'runtime', 'improvement'],
                sessionId: undefined,
                shouldResume: false,
            },
        );
    });

    it('allows explicit chant resume directives and strips them from the query payload', () => {
        assert.equal(shouldAutoResumeChantSession(['proceed']), true);
        assert.deepStrictEqual(
            parseChantSessionDirective(['--session', 'chant-session:abc123', 'proceed']),
            {
                queryArgs: ['proceed'],
                sessionId: 'chant-session:abc123',
                shouldResume: true,
            },
        );
    });

    it('autobot fallback builds the dedicated AutoBot weave invocation', () => {
        const invocation = buildDynamicCommandInvocation(
            'autobot',
            [
                '--bead-id',
                'bead-1',
                '--checker-shell',
                'echo PASS',
                '--timeout',
                '45',
                '--agent-id',
                'SOVEREIGN-WORKER',
                '--worker-note',
                'Immediate Hall/PennyOne context.',
                '--source',
                'runtime',
            ],
            'C:\\Users\\Craig\\Corvus\\CorvusStar',
            'C:\\Users\\Craig\\Corvus\\CorvusStar',
        );

        assert.equal(invocation.weave_id, 'weave:autobot');
        assert.deepStrictEqual(invocation.payload, {
            bead_id: 'bead-1',
            checker_shell: 'echo PASS',
            timeout: 45,
            agent_id: 'SOVEREIGN-WORKER',
            worker_note: 'Immediate Hall/PennyOne context.',
            project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            cwd: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            source: 'runtime',
        });
        assert.deepStrictEqual(invocation.target, {
            domain: 'brain',
            workspace_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            requested_path: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
        });
        assert.equal(invocation.session?.mode, 'cli');
        assert.equal(invocation.session?.interactive, true);
    });

    it('dispatcher fallback preserves raw CLI options for autobot commands', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerDispatcher(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        const originalArgv = process.argv;
        process.argv = [
            'node',
            'test',
            'autobot',
            '--bead-id',
            'bead-1',
            '--timeout',
            '45',
            '--agent-id',
            'SOVEREIGN-WORKER',
        ];

        try {
            await program.parseAsync(process.argv);
        } finally {
            process.argv = originalArgv;
        }

        assert.equal(capture.invocation?.weave_id, 'weave:autobot');
        assert.deepStrictEqual(capture.invocation?.payload, {
            bead_id: 'bead-1',
            timeout: 45,
            agent_id: 'SOVEREIGN-WORKER',
            project_root: 'C:\\Users\\Craig\\Corvus\\CorvusStar',
            cwd: process.cwd(),
            source: 'cli',
        });
    });
});
