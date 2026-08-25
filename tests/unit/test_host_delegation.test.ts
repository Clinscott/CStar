import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    requestHostDelegatedExecution,
    resolveHostDelegatedExecution,
    type DelegatedExecutionRequest,
} from '../../src/core/host_delegation.js';
import {
    expandDelegateBridgeArgs,
    resolveConfiguredDelegateBridge,
    resolveConfiguredDelegatePollBridge,
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
            ['delegate.py', '--request', '{request_path}', '--result', '{result_path}', '--cwd', '{project_root}', '--provider', '{provider}', '--role', '{subagent_profile}'],
            {
                request_path: '/tmp/request.json',
                result_path: '/tmp/result.json',
                project_root: '/repo/root',
                provider: 'codex',
                subagent_profile: 'brooks',
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
            '--role',
            'brooks',
        ]);
    });

    it('resolves provider-specific delegate poll bridge configuration', () => {
        const bridge = resolveConfiguredDelegatePollBridge(
            {
                CORVUS_CODEX_DELEGATE_POLL_BRIDGE_CMD: 'python3',
                CORVUS_CODEX_DELEGATE_POLL_BRIDGE_ARGS_JSON: JSON.stringify([
                    'poll.py',
                    '--handle',
                    '{handle_id}',
                    '--request',
                    '{request_id}',
                    '--result',
                    '{result_path}',
                ]),
            },
            'codex',
        );

        assert.deepEqual(bridge, {
            command: 'python3',
            args: ['poll.py', '--handle', '{handle_id}', '--request', '{request_id}', '--result', '{result_path}'],
        });
    });

    it('rejects retired implementation delegation before invoking a configured bridge', async () => {
        let invocationCount = 0;
        const request = {
            request_id: 'req-implementation-retired',
            repo_root: '/tmp/corvus-implementation-retired',
            boundary: 'subagent',
            task_kind: 'implementation',
            subagent_profile: 'backend',
            prompt: 'Implement the bounded bead.',
        } as unknown as DelegatedExecutionRequest;

        await assert.rejects(
            requestHostDelegatedExecution(
                request,
                {
                    CODEX_SHELL: '1',
                    CODEX_THREAD_ID: 'thread-1',
                    CORVUS_CODEX_DELEGATE_BRIDGE_CMD: 'delegate-bridge',
                    CORVUS_CODEX_DELEGATE_BRIDGE_ARGS_JSON: '[]',
                },
                {
                    execRunner: async () => {
                        invocationCount += 1;
                        return { stdout: '', stderr: '' };
                    },
                },
            ),
            /Implementation must use the CStar Forge lifecycle/,
        );
        assert.equal(invocationCount, 0);
    });

    it('submits structured advisory work through an explicitly configured bridge', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-delegate-bridge-'));
        const submitted: DelegatedExecutionRequest[] = [];

        const result = await requestHostDelegatedExecution(
            {
                request_id: 'req-123',
                repo_root: tmpRoot,
                boundary: 'subagent',
                task_kind: 'critique',
                subagent_profile: 'reviewer',
                prompt: 'Review the bounded proposal.',
                target_paths: ['docs/proposal.md'],
                acceptance_criteria: ['Return findings only.'],
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
                            summary: 'Advisor returned bounded findings.',
                            artifacts: ['finding:proposal-boundary'],
                        }),
                        'utf-8',
                    );
                    return { stdout: '', stderr: '' };
                },
            },
        );

        assert.equal(submitted.length, 1);
        assert.equal(submitted[0]?.boundary, 'subagent');
        assert.equal(submitted[0]?.task_kind, 'critique');
        assert.match(submitted[0]?.prompt ?? '', /EXECUTION CLASS: advisory-only/);
        assert.match(submitted[0]?.prompt ?? '', /Do not modify files or state/);
        assert.equal(submitted[0]?.checker_shell, null);
        assert.equal(submitted[0]?.metadata?.implementation_authority, false);
        assert.equal(result.handle_id, 'handle-123');
        assert.equal(result.provider, 'codex');
        assert.equal(result.status, 'completed');
    });

    it('fails closed instead of spawning a provider-native CLI when no bridge is configured', async () => {
        let invocationCount = 0;
        await assert.rejects(
            requestHostDelegatedExecution(
                {
                    request_id: 'req-native-retired',
                    repo_root: '/tmp/corvus-no-bridge',
                    boundary: 'subagent',
                    task_kind: 'research',
                    subagent_profile: 'brooks',
                    prompt: 'Investigate the bounded issue.',
                },
                {
                    CODEX_SHELL: '1',
                    CODEX_THREAD_ID: 'thread-1',
                },
                {
                    execRunner: async () => {
                        invocationCount += 1;
                        return { stdout: '', stderr: '' };
                    },
                },
            ),
            /Provider-native delegated execution is retired/,
        );
        assert.equal(invocationCount, 0);
    });

    it('resolves a delegated handle through a configured poll bridge', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-delegate-poll-'));

        const result = await resolveHostDelegatedExecution(
            {
                handle_id: 'handle-queued',
                request_id: 'req-queued',
                repo_root: tmpRoot,
                provider: 'codex',
                subagent_profile: 'brooks',
            },
            {
                CODEX_SHELL: '1',
                CODEX_THREAD_ID: 'thread-1',
                CORVUS_CODEX_DELEGATE_POLL_BRIDGE_CMD: 'delegate-poll',
                CORVUS_CODEX_DELEGATE_POLL_BRIDGE_ARGS_JSON: JSON.stringify([
                    '--handle',
                    '{handle_id}',
                    '--request',
                    '{request_id}',
                    '--result',
                    '{result_path}',
                    '--cwd',
                    '{project_root}',
                ]),
            },
            {
                execRunner: async (_command, args) => {
                    const resultPath = args[args.indexOf('--result') + 1];
                    assert.equal(args[args.indexOf('--handle') + 1], 'handle-queued');
                    assert.equal(args[args.indexOf('--request') + 1], 'req-queued');
                    fs.writeFileSync(
                        resultPath,
                        JSON.stringify({
                            handle_id: 'handle-queued',
                            provider: 'codex',
                            status: 'completed',
                            raw_text: '{"summary":"resolved"}',
                        }),
                        'utf-8',
                    );
                    return { stdout: '', stderr: '' };
                },
            },
        );

        assert.equal(result.status, 'completed');
        assert.equal(result.handle_id, 'handle-queued');
    });
});
