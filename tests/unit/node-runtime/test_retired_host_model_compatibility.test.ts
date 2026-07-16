import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    dispatchAgentNativeSkill,
    RETIRED_AGENT_NATIVE_DISPATCH_FAILURE,
} from '../../../src/node/core/runtime/agent_native_dispatch.js';
import {
    defaultHostTextInvoker,
    extractJsonObject,
    resolveRuntimeHostProvider,
} from '../../../src/node/core/runtime/weaves/host_bridge.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../../src/core/host_delegation.js';
import type { RuntimeContext } from '../../../src/node/core/runtime/contracts.js';

const CONTEXT: RuntimeContext = {
    mission_id: 'synthetic-mission',
    bead_id: 'synthetic-bead',
    trace_id: 'synthetic-trace',
    persona: '',
    workspace_root: '/synthetic/repo',
    operator_mode: 'cli',
    target_domain: 'brain',
    interactive: false,
    env: { CORVUS_HOST_PROVIDER: 'codex', SYNTHETIC_SECRET: 'must-not-be-read' },
    timestamp: 1,
};

describe('retired host/model compatibility boundary', () => {
    it('fails agent-native dispatch before source discovery or host callback', async () => {
        let callbackCalls = 0;
        const result = await dispatchAgentNativeSkill({
            id: 'synthetic-activation',
            skill_id: 'corvus-forge',
            target_path: '/synthetic/repo',
            intent: 'synthetic only',
            params: {},
            status: 'PENDING',
            priority: 1,
        }, '/path/that/does/not/exist', CONTEXT, async () => {
            callbackCalls += 1;
            throw new Error('must not run');
        });
        assert.equal(result.handled, true);
        if (!result.handled) throw new Error('expected handled retirement result');
        assert.equal(result.result.status, 'FAILURE');
        assert.equal(result.result.error, RETIRED_AGENT_NATIVE_DISPATCH_FAILURE);
        assert.deepEqual({
            execution_dispatched: result.result.metadata?.execution_dispatched,
            hall_mutation_started: result.result.metadata?.hall_mutation_started,
            provider_attempted: result.result.metadata?.provider_attempted,
            process_started: result.result.metadata?.process_started,
            source_access_started: result.result.metadata?.source_access_started,
            host_callback_attempted: result.result.metadata?.host_callback_attempted,
        }, {
            execution_dispatched: false,
            hall_mutation_started: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
            host_callback_attempted: false,
        });
        assert.equal(callbackCalls, 0);
    });

    it('does not infer a runtime provider and tombstones the default host invoker', async () => {
        assert.equal(resolveRuntimeHostProvider(CONTEXT), null);
        await assert.rejects(
            defaultHostTextInvoker({
                prompt: 'synthetic only',
                provider: 'codex',
                projectRoot: '/synthetic/repo',
                source: 'synthetic-test',
                executionSurface: 'host_session_invoker',
            }),
            new RegExp(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE),
        );
    });

    it('retains only the pure JSON extraction helper', () => {
        assert.deepEqual(extractJsonObject('prefix {"ok":true} suffix'), { ok: true });
        assert.throws(() => extractJsonObject('no object'), /did not return a JSON object/);
    });
});
