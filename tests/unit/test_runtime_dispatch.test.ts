import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapRuntime } from  '../../src/node/core/runtime/bootstrap.js';
import { RuntimeDispatcher } from  '../../src/node/core/runtime/dispatcher.js';
import { RuntimeAdapter, RuntimeContext, WeaveInvocation, WeaveResult } from  '../../src/node/core/runtime/contracts.js';

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

        const builtInAdapters = [
            'weave:architect',
            'weave:autobot',
            'weave:chant',
            'weave:distill',
            'weave:critique',
            'weave:dynamic-command',
            'weave:evolve',
            'weave:orchestrate',
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
            'weave:temporal-learning'
        ];
        
        const registered = dispatcher.listAdapterIds();
        for (const adapter of builtInAdapters) {
            assert.ok(registered.includes(adapter), `Expected ${adapter} to be registered`);
        }
    });

    it('dispatches an isolated runtime adapter without touching the singleton', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        dispatcher.registerAdapter(new EchoAdapter());

        const result = await dispatcher.dispatch({
            weave_id: 'weave:echo',
            payload: { message: 'echo complete' },
            target: {
                domain: 'brain',
                workspace_root: process.cwd(),
                requested_path: process.cwd(),
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
        assert.strictEqual(result.metadata?.operator_mode, 'subkernel');
        assert.strictEqual(result.metadata?.target_domain, 'brain');
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
