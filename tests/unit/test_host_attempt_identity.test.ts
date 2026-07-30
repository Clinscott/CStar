import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    invokeSingleHostAttempt,
    requiresNativeCodexInvoker,
} from '../../src/core/mimir_host_transport.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../src/core/host_delegation.js';

describe('retired host attempt identity', () => {
    it('returns immutable undispatched evidence without invoking runner or callback', async () => {
        let runnerCalls = 0;
        let callbackCalls = 0;
        await assert.rejects(
            invokeSingleHostAttempt({
                prompt: 'synthetic only',
                provider: 'codex',
                projectRoot: '/synthetic/repo',
                env: { SYNTHETIC_SECRET: 'must-not-be-read' },
                hostSessionInvoker: async () => {
                    callbackCalls += 1;
                    return 'must not run';
                },
                hostExecRunner: async () => {
                    runnerCalls += 1;
                    return { stdout: '', stderr: '' };
                },
                hostSessionTimeoutMs: 1,
                requireNativeCodexInvoker: true,
                requestedSurface: 'host_session_invoker',
            }),
            (error: unknown) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE));
                assert.deepEqual((error as { evidence?: unknown }).evidence, {
                    requested_provider: 'codex',
                    actual_provider: null,
                    requested_surface: 'host_session_invoker',
                    actual_surface: null,
                    execution_dispatched: false,
                });
                return true;
            },
        );
        assert.deepEqual({ runnerCalls, callbackCalls }, { runnerCalls: 0, callbackCalls: 0 });
    });

    it('retains only the pure agent-harness classification helper', () => {
        assert.equal(requiresNativeCodexInvoker({
            prompt: '',
            transport_mode: 'host_session',
            correlation_id: 'synthetic',
            caller: { source: 'synthetic' },
            metadata: { execution_mode: 'agent-native' },
        }, 'codex'), true);
        assert.equal(requiresNativeCodexInvoker({
            prompt: '',
            transport_mode: 'host_session',
            correlation_id: 'synthetic',
            caller: { source: 'synthetic' },
            metadata: { execution_mode: 'agent-native' },
        }, 'gemini'), false);
    });
});
