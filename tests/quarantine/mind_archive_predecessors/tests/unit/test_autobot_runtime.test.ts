import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RuntimeContext } from  '../../src/node/core/runtime/contracts.js';
import { RUNTIME_KERNEL_ROOT } from  '../../src/node/core/runtime/kernel_root.ts';
import { AutoBotWeave } from  '../../src/node/core/runtime/weaves/autobot.js';

type RunnerCall = {
    command: string;
    args: string[];
    options: {
        cwd?: string;
        env?: Record<string, string | undefined>;
    };
};

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-AUTOBOT',
        trace_id: 'TRACE-AUTOBOT',
        persona: 'ALFRED',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

describe('AutoBot runtime weave', () => {
    it('translates a structured runtime payload into the authoritative autobot skill invocation', async () => {
        const calls: RunnerCall[] = [];
        const runner = (async (
            command: string,
            args: string[],
            options: RunnerCall['options'],
        ) => {
            calls.push({ command, args, options });
            return {
                stdout: JSON.stringify({
                    skill_id: 'autobot',
                    status: 'SUCCESS',
                    outcome: 'READY_FOR_REVIEW',
                    summary: 'AutoBot completed bead bead-1; no checker was configured.',
                    bead_id: 'bead-1',
                    attempt_count: 1,
                    max_attempts: 2,
                }),
            };
        }) as unknown as typeof import('execa').execa;

        const weave = new AutoBotWeave(runner);
        const result = await weave.execute(
            {
                weave_id: 'weave:autobot',
                payload: {
                    bead_id: 'bead-1',
                    checker_shell: 'echo PASS',
                    max_attempts: 2,
                    worker_note: 'Immediate bead brief from chant.',
                    project_root: '/tmp/corvusstar',
                    cwd: '/tmp/corvusstar',
                    source: 'runtime',
                },
            },
            createContext('/tmp/corvusstar'),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.context_policy, 'project');
        assert.equal(result.metadata?.outcome, 'READY_FOR_REVIEW');
        assert.equal(calls.length, 1);
        assert.match(calls[0]?.command ?? '', /python/i);
        assert.ok(calls[0]?.args.includes('--bead-id'));
        assert.ok(calls[0]?.args.includes('bead-1'));
        assert.ok(calls[0]?.args.includes('--checker-shell'));
        const checkerShellIndex = calls[0]?.args.indexOf('--checker-shell') ?? -1;
        const checkerShell = checkerShellIndex >= 0 ? calls[0]?.args[checkerShellIndex + 1] : '';
        assert.match(checkerShell ?? '', /echo PASS/);
        assert.ok(calls[0]?.args.includes('--worker-note'));
        assert.ok(calls[0]?.args.includes('Immediate bead brief from chant.'));
        assert.ok(calls[0]?.args.includes('--project-root'));
        assert.ok(calls[0]?.args.includes('/tmp/corvusstar'));
        assert.equal(calls[0]?.options.cwd, RUNTIME_KERNEL_ROOT);
        assert.equal(calls[0]?.options.env?.PYTHONPATH, RUNTIME_KERNEL_ROOT);
    });
});
