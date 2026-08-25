import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    requestHostDelegatedExecution,
    resolveHostDelegatedExecution,
    RETIRED_HOST_PROVIDER_DELEGATION_FAILURE,
} from '../../src/core/host_delegation.js';
import {
    defaultDelegationExecRunner,
    runDelegationCommand,
    validateDelegationTimeout,
} from '../../src/core/host_delegation_transport.js';

describe('retired host delegated execution compatibility', () => {
    it('fails request before provider, process, filesystem, or callback access', async () => {
        let runnerCalls = 0;
        await assert.rejects(
            requestHostDelegatedExecution({
                request_id: 'synthetic-request',
                repo_root: '/synthetic/repo',
                boundary: 'subagent',
                task_kind: 'implementation',
                prompt: 'synthetic only',
                requested_provider: 'codex',
                execution_surface: 'provider_native_cli',
            }, { SYNTHETIC_SECRET: 'must-not-be-read' }, {
                execRunner: async () => {
                    runnerCalls += 1;
                    return { stdout: '', stderr: '' };
                },
            }),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE));
                assert.deepEqual((error as { evidence?: unknown }).evidence, {
                    requested_provider: 'codex',
                    actual_provider: null,
                    requested_surface: 'provider_native_cli',
                    actual_surface: null,
                    execution_dispatched: false,
                });
                return true;
            },
        );
        assert.equal(runnerCalls, 0);
    });

    it('fails poll before invoking a supplied runner', async () => {
        let runnerCalls = 0;
        await assert.rejects(
            resolveHostDelegatedExecution({
                handle_id: 'synthetic-handle',
                request_id: 'synthetic-request',
                repo_root: '/synthetic/repo',
                provider: 'gemini',
            }, {}, {
                execRunner: async () => {
                    runnerCalls += 1;
                    return { stdout: '', stderr: '' };
                },
            }),
            new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE),
        );
        assert.equal(runnerCalls, 0);
    });

    it('keeps timeout validation pure while both execution seams fail closed', async () => {
        assert.equal(validateDelegationTimeout(25), 25);
        assert.throws(() => validateDelegationTimeout(0), /finite positive number/);
        await assert.rejects(
            defaultDelegationExecRunner('forbidden', [], { cwd: '/', env: {} }),
            new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE),
        );
        let runnerCalls = 0;
        await assert.rejects(
            runDelegationCommand(async () => {
                runnerCalls += 1;
                return { stdout: '', stderr: '' };
            }, 'forbidden', [], { cwd: '/', env: {} }, 10, 'synthetic'),
            new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE),
        );
        assert.equal(runnerCalls, 0);
    });
});
