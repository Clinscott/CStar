import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';

import { registerStartCommand } from  '../../src/node/core/commands/start.js';
import { registerRavenCommand } from  '../../src/node/core/commands/ravens.js';
import { registerPennyOneCommand } from  '../../src/node/core/commands/pennyone.js';
import {
    buildRegistrySkillBeadInvocation,
    buildDynamicCommandInvocation,
    parseChantSessionDirective,
    registerDispatcher,
    shouldAutoResumeChantSession,
} from '../../src/node/core/commands/dispatcher.ts';
import { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from  '../../src/node/core/runtime/contracts.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SkillBead } from '../../src/node/core/skills/types.js';

class CaptureDispatchPort implements RuntimeDispatchPort {
    public invocation: WeaveInvocation<unknown> | SkillBead<unknown> | null = null;

    public async dispatch<T>(invocation: WeaveInvocation<T> | SkillBead<T>): Promise<WeaveResult> {
        this.invocation = invocation as WeaveInvocation<unknown> | SkillBead<unknown>;
        return {
            weave_id: 'weave_id' in invocation ? invocation.weave_id : invocation.skill_id,
            status: 'SUCCESS',
            output: 'captured',
        };
    }
}

class ResultDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(_invocation: WeaveInvocation<T> | SkillBead<T>): Promise<WeaveResult> {
        return {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne maintenance artifacts (1 root(s), 1 artifact(s)).',
            metadata: {
                adapter: 'runtime:pennyone-artifacts',
                artifact_count: 1,
            },
        };
    }
}

class ReportResultDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(_invocation: WeaveInvocation<T> | SkillBead<T>): Promise<WeaveResult> {
        return {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne Hall hygiene report (1 root(s), 1 root(s) with normalize receipts, 0 stale receipt(s), 3 open bead(s), 2 validation run(s)).',
            metadata: {
                adapter: 'runtime:pennyone-report',
                receipt_count: 1,
                total_open_beads: 3,
            },
        };
    }
}

class NormalizeResultDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(_invocation: WeaveInvocation<T> | SkillBead<T>): Promise<WeaveResult> {
        return {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne normalized Hall authority metadata (1 root(s), 1 repository alias(es), 2 bead(s), 3 planning session(s), 4 proposal(s), 5 document(s)).',
            metadata: {
                adapter: 'runtime:pennyone-normalize',
                repository_updates: 1,
                bead_updates: 2,
                planning_updates: 3,
                proposal_updates: 4,
                document_updates: 5,
            },
        };
    }
}

class StatusResultDispatchPort implements RuntimeDispatchPort {
    public async dispatch<T>(_invocation: WeaveInvocation<T> | SkillBead<T>): Promise<WeaveResult> {
        return {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne Hall maintenance status (1 root(s), 1 normalize receipt(s), 1 hygiene report(s), 0 stale receipt(s), 2 maintenance artifact(s), 3 open bead(s), 2 validation run(s)).',
            metadata: {
                adapter: 'runtime:pennyone-status',
                receipt_count: 1,
                report_count: 1,
                artifact_count: 2,
            },
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

    it('pennyone command dispatches semantic-intent refresh through the shared pennyone weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--refresh-intents',
            'src',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'refresh_intents',
                path: 'src',
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

    it('pennyone command dispatches Hall metadata normalization through the shared pennyone weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--normalize',
            'src',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'normalize',
                path: 'src',
                estate: false,
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

    it('pennyone command dispatches estate-wide Hall normalization explicitly through the shared pennyone weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--normalize',
            '.',
            '--estate',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'normalize',
                path: '.',
                estate: true,
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

    it('pennyone command dispatches Hall hygiene reporting through the shared pennyone weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--report',
            '.',
            '--estate',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'report',
                path: '.',
                estate: true,
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

    it('pennyone command dispatches maintenance artifact listing through the shared pennyone weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--artifacts',
            '.',
            '--kind',
            'report',
            '--limit',
            '2',
            '--since',
            '7d',
            '--estate',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'artifacts',
                path: '.',
                estate: true,
                artifact_kind: 'report',
                limit: 2,
                since: '7d',
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

    it('pennyone command emits machine-readable JSON when requested', async () => {
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', new ResultDispatchPort());

        let stdout = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdout += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await program.parseAsync([
                'node',
                'test',
                'pennyone',
                '--artifacts',
                '.',
                '--json',
            ]);
        } finally {
            process.stdout.write = originalWrite;
        }

        const payload = JSON.parse(stdout);
        assert.deepStrictEqual(payload, {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne maintenance artifacts (1 root(s), 1 artifact(s)).',
            metadata: {
                adapter: 'runtime:pennyone-artifacts',
                artifact_count: 1,
            },
        });
    });

    it('pennyone command dispatches maintenance status through the shared pennyone weave', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--status',
            '.',
            '--kind',
            'maintenance',
            '--since',
            '30d',
            '--estate',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'status',
                path: '.',
                estate: true,
                artifact_kind: 'maintenance',
                limit: undefined,
                since: '30d',
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

    it('pennyone command forwards absolute since dates for maintenance artifact listing', async () => {
        const capture = new CaptureDispatchPort();
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', capture);

        await program.parseAsync([
            'node',
            'test',
            'pennyone',
            '--artifacts',
            '.',
            '--kind',
            'maintenance',
            '--since-date',
            '2026-03-01',
            '--estate',
        ]);

        assert.deepStrictEqual(capture.invocation, {
            weave_id: 'weave:pennyone',
            payload: {
                action: 'artifacts',
                path: '.',
                estate: true,
                artifact_kind: 'maintenance',
                limit: undefined,
                since: undefined,
                since_date: '2026-03-01',
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

    it('pennyone report command emits machine-readable JSON when requested', async () => {
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', new ReportResultDispatchPort());

        let stdout = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdout += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await program.parseAsync([
                'node',
                'test',
                'pennyone',
                '--report',
                '.',
                '--estate',
                '--json',
            ]);
        } finally {
            process.stdout.write = originalWrite;
        }

        const payload = JSON.parse(stdout);
        assert.deepStrictEqual(payload, {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne Hall hygiene report (1 root(s), 1 root(s) with normalize receipts, 0 stale receipt(s), 3 open bead(s), 2 validation run(s)).',
            metadata: {
                adapter: 'runtime:pennyone-report',
                receipt_count: 1,
                total_open_beads: 3,
            },
        });
    });

    it('pennyone normalize command emits machine-readable JSON when requested', async () => {
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', new NormalizeResultDispatchPort());

        let stdout = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdout += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await program.parseAsync([
                'node',
                'test',
                'pennyone',
                '--normalize',
                '.',
                '--estate',
                '--json',
            ]);
        } finally {
            process.stdout.write = originalWrite;
        }

        const payload = JSON.parse(stdout);
        assert.deepStrictEqual(payload, {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne normalized Hall authority metadata (1 root(s), 1 repository alias(es), 2 bead(s), 3 planning session(s), 4 proposal(s), 5 document(s)).',
            metadata: {
                adapter: 'runtime:pennyone-normalize',
                repository_updates: 1,
                bead_updates: 2,
                planning_updates: 3,
                proposal_updates: 4,
                document_updates: 5,
            },
        });
    });

    it('pennyone status command emits machine-readable JSON when requested', async () => {
        const program = new Command();
        registerPennyOneCommand(program, 'C:\\Users\\Craig\\Corvus\\CorvusStar', new StatusResultDispatchPort());

        let stdout = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            stdout += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await program.parseAsync([
                'node',
                'test',
                'pennyone',
                '--status',
                '.',
                '--json',
            ]);
        } finally {
            process.stdout.write = originalWrite;
        }

        const payload = JSON.parse(stdout);
        assert.deepStrictEqual(payload, {
            weave_id: 'weave:pennyone',
            status: 'TRANSITIONAL',
            output: 'PennyOne Hall maintenance status (1 root(s), 1 normalize receipt(s), 1 hygiene report(s), 0 stale receipt(s), 2 maintenance artifact(s), 3 open bead(s), 2 validation run(s)).',
            metadata: {
                adapter: 'runtime:pennyone-status',
                receipt_count: 1,
                report_count: 1,
                artifact_count: 2,
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

    it('registry-backed command activation builds a skill bead instead of legacy dynamic-command', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-command-registry-'));
        try {
            fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, '.agents', 'skill_registry.json'),
                JSON.stringify({
                    entries: {
                        orchestrate: {
                            execution: { mode: 'agent-native' },
                            runtime_trigger: 'orchestrate',
                        },
                    },
                }),
                'utf-8',
            );

            const invocation = buildRegistrySkillBeadInvocation(
                'orchestrate',
                ['--max-parallel', '1'],
                tmpRoot,
                tmpRoot,
            );

            assert.ok(invocation);
            assert.equal(invocation?.skill_id, 'orchestrate');
            assert.equal(invocation?.target_path, tmpRoot);
            assert.deepStrictEqual(invocation?.params, {
                command: 'orchestrate',
                args: ['--max-parallel', '1'],
                project_root: tmpRoot,
                cwd: tmpRoot,
                source: 'cli',
            });
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
