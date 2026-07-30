import assert from 'node:assert/strict';
import { Command } from 'commander';
import { afterEach, describe, it, mock } from 'node:test';

import {
    buildCalculusInvocation,
    registerCalculusCommand,
    type CalculusCommandRunner,
} from '../../src/node/core/commands/calculus.js';
import type { WeaveResult } from '../../src/node/core/runtime/contracts.js';

function successResult(action: 'score' | 'audit', verdict: 'PASS' | 'BREACH'): WeaveResult {
    return {
        weave_id: 'prime:calculus',
        status: 'SUCCESS',
        output: 'calculus complete',
        metadata: {
            calculus: {
                schema_version: '1.0',
                coverage: 'heuristic',
                action,
                file: 'src/example.ts',
                verdict,
                matrix: { overall: 9.5 },
                breaches: verdict === 'PASS' ? [] : [{ severity: 'HIGH' }],
            },
        },
    };
}

describe('Gungnir Calculus explicit compatibility command', () => {
    afterEach(() => {
        mock.reset();
        process.exitCode = 0;
    });

    it('builds a bounded PRIME invocation', () => {
        assert.deepEqual(
            buildCalculusInvocation('score', 'src/example.ts', '/workspace/cstar'),
            {
                weave_id: 'prime:calculus',
                payload: { action: 'score', file: 'src/example.ts' },
                target: {
                    domain: 'brain',
                    workspace_root: '/workspace/cstar',
                    requested_path: 'src/example.ts',
                },
                session: { mode: 'cli', interactive: true },
            },
        );
    });

    it('emits only the stable report for explicit JSON use', async () => {
        let capturedAction = '';
        const runner: CalculusCommandRunner = async (invocation) => {
            capturedAction = invocation.payload.action;
            return successResult('score', 'PASS');
        };
        const lines: string[] = [];
        mock.method(console, 'log', (line: string) => lines.push(line));
        const program = new Command();
        program.exitOverride();
        registerCalculusCommand(program, '/workspace/cstar', runner);

        await program.parseAsync(['node', 'compat', 'calculus', 'score', 'src/example.ts', '--json']);

        assert.equal(capturedAction, 'score');
        assert.equal(lines.length, 1);
        assert.equal(JSON.parse(lines[0]).coverage, 'heuristic');
        assert.equal(JSON.parse(lines[0]).weave_id, undefined);
        assert.equal(process.exitCode, 0);
    });

    it('uses exit two for audit evidence and one for failure', async () => {
        mock.method(console, 'log', () => undefined);
        const auditProgram = new Command();
        auditProgram.exitOverride();
        registerCalculusCommand(
            auditProgram,
            '/workspace/cstar',
            async () => successResult('audit', 'BREACH'),
        );
        await auditProgram.parseAsync([
            'node', 'compat', 'calculus', 'audit', 'src/example.ts', '--json',
        ]);
        assert.equal(process.exitCode, 2);

        const failedProgram = new Command();
        failedProgram.exitOverride();
        registerCalculusCommand(failedProgram, '/workspace/cstar', async () => ({
            weave_id: 'prime:calculus',
            status: 'FAILURE',
            output: '',
            error: 'outside workspace',
            metadata: { error_code: 'PATH_OUTSIDE_WORKSPACE' },
        }));
        await failedProgram.parseAsync([
            'node', 'compat', 'calculus', 'score', '../outside.ts', '--json',
        ]);
        assert.equal(process.exitCode, 1);
    });

    it('fails malformed successful reports closed', async () => {
        const lines: string[] = [];
        mock.method(console, 'log', (line: string) => lines.push(line));
        const program = new Command();
        program.exitOverride();
        registerCalculusCommand(program, '/workspace/cstar', async () => ({
            weave_id: 'prime:calculus',
            status: 'SUCCESS',
            output: 'missing report',
        }));

        await program.parseAsync([
            'node', 'compat', 'calculus', 'score', 'src/example.ts', '--json',
        ]);

        assert.equal(process.exitCode, 1);
        assert.equal(JSON.parse(lines[0]).error.code, 'INVALID_CALCULUS_REPORT');
    });
});
