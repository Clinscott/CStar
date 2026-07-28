import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
                action,
                file: 'src/example.ts',
                verdict,
                matrix: { overall: 9.5 },
                breaches: verdict === 'PASS' ? [] : [{ severity: 'HIGH' }],
            },
        },
    };
}

describe('Gungnir Calculus command', () => {
    afterEach(() => {
        mock.reset();
        process.exitCode = 0;
    });

    it('builds the canonical PRIME invocation', () => {
        assert.deepEqual(
            buildCalculusInvocation('score', 'src/example.ts', '/workspace/cstar'),
            {
                weave_id: 'prime:calculus',
                payload: {
                    action: 'score',
                    file: 'src/example.ts',
                },
                target: {
                    domain: 'brain',
                    workspace_root: '/workspace/cstar',
                    requested_path: 'src/example.ts',
                },
                session: {
                    mode: 'cli',
                    interactive: true,
                },
            },
        );
    });

    it('prints only the stable report for JSON score output', async () => {
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

        await program.parseAsync(['node', 'cstar', 'calculus', 'score', 'src/example.ts', '--json']);

        assert.equal(capturedAction, 'score');
        assert.equal(lines.length, 1);
        assert.equal(JSON.parse(lines[0]).schema_version, '1.0');
        assert.equal(JSON.parse(lines[0]).weave_id, undefined);
        assert.equal(process.exitCode, 0);
    });

    it('uses exit status two for audit evidence and one for execution failure', async () => {
        const program = new Command();
        program.exitOverride();
        registerCalculusCommand(program, '/workspace/cstar', async () => successResult('audit', 'BREACH'));
        mock.method(console, 'log', () => undefined);

        await program.parseAsync(['node', 'cstar', 'calculus', 'audit', 'src/example.ts', '--json']);
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
        await failedProgram.parseAsync(['node', 'cstar', 'calculus', 'score', '../outside.ts', '--json']);
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

        await program.parseAsync(['node', 'cstar', 'calculus', 'score', 'src/example.ts', '--json']);

        assert.equal(process.exitCode, 1);
        assert.equal(JSON.parse(lines[0]).error.code, 'INVALID_CALCULUS_REPORT');
    });

    it('keeps the full CLI workspace read-only and JSON-clean', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calculus-cli-readonly-'));
        fs.writeFileSync(path.join(workspaceRoot, 'example.ts'), 'export const value = 1;\n');
        const before = fs.readdirSync(workspaceRoot);
        const result = spawnSync(
            process.execPath,
            [
                path.join(process.cwd(), 'bin', 'cstar.js'),
                '--root',
                workspaceRoot,
                'calculus',
                'score',
                'example.ts',
                '--json',
            ],
            {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    CSTAR_PROJECT_ROOT: workspaceRoot,
                    CSTAR_WORKSPACE_ROOT: workspaceRoot,
                },
                encoding: 'utf-8',
            },
        );

        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).coverage, 'heuristic');
        assert.deepEqual(fs.readdirSync(workspaceRoot), before);
    });
});
