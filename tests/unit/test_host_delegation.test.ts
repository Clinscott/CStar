import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    requestHostDelegatedExecution,
    type DelegatedExecutionRequest,
} from '../../src/core/host_delegation.js';
import {
    expandDelegateBridgeArgs,
    resolveConfiguredDelegateBridge,
} from '../../src/core/host_session.js';

describe('Host delegated execution bridge', () => {
    it('resolves provider-specific delegate bridge configuration', () => {
        const bridge = resolveConfiguredDelegateBridge(
            {
                CORVUS_CODEX_DELEGATE_BRIDGE_CMD: 'python3',
                CORVUS_CODEX_DELEGATE_BRIDGE_ARGS_JSON: JSON.stringify([
                    'delegate.py',
                    '--request',
                    '{request_path}',
                    '--result',
                    '{result_path}',
                ]),
            },
            'codex',
        );

        assert.deepEqual(bridge, {
            command: 'python3',
            args: ['delegate.py', '--request', '{request_path}', '--result', '{result_path}'],
        });
    });

    it('expands delegate bridge placeholders', () => {
        const args = expandDelegateBridgeArgs(
            ['delegate.py', '--request', '{request_path}', '--result', '{result_path}', '--cwd', '{project_root}', '--provider', '{provider}'],
            {
                request_path: '/tmp/request.json',
                result_path: '/tmp/result.json',
                project_root: '/repo/root',
                provider: 'codex',
            },
        );

        assert.deepEqual(args, [
            'delegate.py',
            '--request',
            '/tmp/request.json',
            '--result',
            '/tmp/result.json',
            '--cwd',
            '/repo/root',
            '--provider',
            'codex',
        ]);
    });

    it('submits structured delegated work through a configured bridge and reads the result file', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-delegate-bridge-'));
        const submitted: DelegatedExecutionRequest[] = [];

        const result = await requestHostDelegatedExecution(
            {
                request_id: 'req-123',
                repo_root: tmpRoot,
                boundary: 'subagent',
                task_kind: 'implementation',
                prompt: 'Implement the bounded bead.',
                target_paths: ['src/example.ts'],
                acceptance_criteria: ['The file compiles.'],
                checker_shell: 'node scripts/run-tsx.mjs --test tests/unit/example.test.ts',
            },
            {
                CODEX_SHELL: '1',
                CODEX_THREAD_ID: 'thread-1',
                CORVUS_CODEX_DELEGATE_BRIDGE_CMD: 'delegate-bridge',
                CORVUS_CODEX_DELEGATE_BRIDGE_ARGS_JSON: JSON.stringify([
                    '--request',
                    '{request_path}',
                    '--result',
                    '{result_path}',
                    '--cwd',
                    '{project_root}',
                ]),
            },
            {
                execRunner: async (_command, args) => {
                    const requestPath = args[args.indexOf('--request') + 1];
                    const resultPath = args[args.indexOf('--result') + 1];
                    const request = JSON.parse(fs.readFileSync(requestPath, 'utf-8')) as DelegatedExecutionRequest;
                    submitted.push(request);
                    fs.writeFileSync(
                        resultPath,
                        JSON.stringify({
                            handle_id: 'handle-123',
                            provider: 'codex',
                            status: 'completed',
                            summary: 'Worker completed the bounded implementation.',
                            artifacts: ['src/example.ts'],
                            verification: {
                                checker_shell: request.checker_shell,
                                status: 'passed',
                            },
                        }),
                        'utf-8',
                    );
                    return { stdout: '', stderr: '' };
                },
            },
        );

        assert.equal(submitted.length, 1);
        assert.equal(submitted[0]?.boundary, 'subagent');
        assert.equal(submitted[0]?.task_kind, 'implementation');
        assert.equal(result.handle_id, 'handle-123');
        assert.equal(result.provider, 'codex');
        assert.equal(result.status, 'completed');
    });

    it('fails closed when no delegate bridge is configured for the provider', async () => {
        await assert.rejects(
            requestHostDelegatedExecution(
                {
                    request_id: 'req-missing',
                    repo_root: '/tmp/corvus-no-bridge',
                    boundary: 'subagent',
                    task_kind: 'research',
                    prompt: 'Investigate the bounded issue.',
                },
                {
                    CODEX_SHELL: '1',
                    CODEX_THREAD_ID: 'thread-1',
                },
            ),
            /configured delegated-execution bridge/i,
        );
    });
});
