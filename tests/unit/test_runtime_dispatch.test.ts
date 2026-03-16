import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapRuntime } from '../../src/node/core/runtime/bootstrap.ts';
import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.ts';
import { RuntimeAdapter, RuntimeContext, WeaveInvocation, WeaveResult } from '../../src/node/core/runtime/contracts.ts';

class EchoAdapter implements RuntimeAdapter<{ message: string }> {
    public readonly id = 'weave:echo';

    public async execute(
        invocation: WeaveInvocation<{ message: string }>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        return {
            weave_id: this.id,
            status: 'SUCCESS',
            output: invocation.payload.message,
            metrics_delta: { score: 82 },
            metadata: {
                adapter: 'test:echo',
                workspace_root: context.workspace_root,
                operator_mode: context.operator_mode,
                target_domain: context.target_domain,
                requested_root: context.requested_root,
            },
        };
    }
}

describe('Canonical Runtime Dispatcher (CS-P1-01)', () => {
    it('registers the authoritative built-in adapters', () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        bootstrapRuntime(dispatcher);

        assert.deepStrictEqual(dispatcher.listAdapterIds(), [
            'weave:architect',
            'weave:autobot',
            'weave:chant',
            'weave:compress',
            'weave:critique',
            'weave:dynamic-command',
            'weave:evolve',
            'weave:pennyone',
            'weave:ravens',
            'weave:ravens-cycle',
            'weave:ravens-hunt',
            'weave:ravens-memory',
            'weave:ravens-promote',
            'weave:ravens-validate',
            'weave:research',
            'weave:start',
            'weave:taliesin-forge',
        ]);
    });

    it('dispatches an isolated runtime adapter without touching the singleton', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        dispatcher.registerAdapter(new EchoAdapter());

        const result = await dispatcher.dispatch({
            weave_id: 'weave:echo',
            payload: { message: 'echo complete' },
            target: {
                domain: 'spoke',
                workspace_root: 'C:\\estate\\KeepOS',
                requested_path: 'C:\\estate',
                spoke: 'keepos',
            },
            session: {
                mode: 'subkernel',
                interactive: false,
                session_id: 'session-42',
            },
        });

        assert.strictEqual(result.status, 'SUCCESS');
        assert.strictEqual(result.output, 'echo complete');
        assert.strictEqual(result.metrics_delta?.score, 82);
        assert.strictEqual(result.metadata?.workspace_root, 'C:/estate/KeepOS');
        assert.strictEqual(result.metadata?.operator_mode, 'subkernel');
        assert.strictEqual(result.metadata?.target_domain, 'spoke');
        assert.strictEqual(result.metadata?.requested_root, 'C:\\estate');
    });

    it('returns a structured failure for unknown weaves', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();

        const result = await dispatcher.dispatch({
            weave_id: 'weave:unknown',
            payload: {},
        });

        assert.strictEqual(result.status, 'FAILURE');
        assert.match(result.error ?? '', /unable to resolve the weave/i);
    });
});
