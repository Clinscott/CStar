import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StartAdapter, DynamicCommandAdapter } from  '../../../src/node/core/runtime/adapters.js';
import { RuntimeContext, WeaveInvocation } from  '../../../src/node/core/runtime/contracts.js';
import { RETIRED_DYNAMIC_COMMAND_FAILURE } from '../../../src/node/core/runtime/adapters/legacy_commands.js';
import { RETIRED_AUTONOMOUS_RUNTIME_FAILURE } from '../../../src/node/core/runtime/retired_adapter.js';

function assertNoLegacyEffects(metadata: Record<string, unknown> | undefined): void {
    assert.deepEqual(
        {
            execution_dispatched: metadata?.execution_dispatched,
            hall_mutation_started: metadata?.hall_mutation_started,
            provider_attempted: metadata?.provider_attempted,
            process_started: metadata?.process_started,
            source_access_started: metadata?.source_access_started,
        },
        {
            execution_dispatched: false,
            hall_mutation_started: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
        },
    );
}

describe('Runtime Adapters', () => {
    describe('StartAdapter', () => {
        it('retires direct wake and resume before effects', async () => {
            let wakeCount = 0;
            const adapter = new StartAdapter(undefined, undefined, async () => { wakeCount += 1; });
            const invocation: WeaveInvocation<any> = {
                weave_id: 'weave:start',
                payload: {}
            };
            const context: RuntimeContext = {
                mission_id: 'TEST',
                trace_id: 'TRACE',
                persona: 'ALFRED',
                workspace_root: '.',
                operator_mode: 'cli',
                target_domain: 'brain',
                interactive: true,
                env: { CORVUS_HOST_SESSION_ACTIVE: 'false' },
                timestamp: Date.now()
            };

            const result = await adapter.execute(invocation, context);
            assert.strictEqual(wakeCount, 0);
            assert.strictEqual(result.status, 'FAILURE');
            assert.equal(result.error, RETIRED_AUTONOMOUS_RUNTIME_FAILURE);
            assertNoLegacyEffects(result.metadata);
        });
    });

    describe('DynamicCommandAdapter', () => {
        it('returns one stable retirement failure before every effect boundary', async () => {
            const adapter = new DynamicCommandAdapter();
            const invocation: WeaveInvocation<any> = {
                weave_id: 'weave:dynamic-command',
                payload: {
                    command: 'apparently-registered',
                    args: ['--live'],
                    project_root: '/synthetic/does-not-exist',
                    cwd: '/synthetic/does-not-exist',
                },
            };
            const context: RuntimeContext = { workspace_root: '.', env: {} } as any;

            const result = await adapter.execute(invocation, context);
            assert.strictEqual(result.status, 'FAILURE');
            assert.equal(result.error, RETIRED_DYNAMIC_COMMAND_FAILURE);
            assert.equal(result.metadata?.failure_code, RETIRED_DYNAMIC_COMMAND_FAILURE);
            assertNoLegacyEffects(result.metadata);
        });
    });
});
