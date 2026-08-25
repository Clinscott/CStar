import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.js';

class TrapSpokeAdapter implements RuntimeAdapter<{ message: string }> {
    public readonly id = 'weave:spoke-echo';
    public calls = 0;

    public async execute(
        _invocation: WeaveInvocation<{ message: string }>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('retired spoke adapter must not execute');
    }
}

describe('retired mounted-spoke runtime execution', () => {
    let root: string;
    let previousProjectRoot: string | undefined;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-spoke-runtime-'));
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        fs.writeFileSync(path.join(root, '.agents', 'skill_registry.json'), JSON.stringify({
            entries: {
                spoke_echo: {
                    entry_surface: 'compatibility',
                    runtime_trigger: 'weave:spoke-echo',
                    execution: { adapter_id: 'weave:spoke-echo' },
                },
            },
        }));
        previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        process.env.CSTAR_PROJECT_ROOT = root;
    });

    afterEach(() => {
        if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
        else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects registration instead of restoring a spoke adapter', () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        const adapter = new TrapSpokeAdapter();

        assert.throws(
            () => dispatcher.registerAdapter(adapter),
            /legacy_runtime_adapter_registration_retired:weave:spoke-echo/,
        );
        assert.deepStrictEqual(dispatcher.listAdapterIds(), []);
        assert.equal(adapter.calls, 0);
    });

    it('fails before resolving mounted or missing spoke targets', async () => {
        const dispatcher = RuntimeDispatcher.createIsolated();
        for (const spoke of ['keepos', 'missing']) {
            const result = await dispatcher.dispatch({
                weave_id: 'weave:spoke-echo',
                payload: { message: 'must not execute' },
                target: {
                    domain: 'spoke',
                    spoke,
                    requested_path: `spoke://${spoke}/src/main.ts`,
                },
                session: { mode: 'subkernel', interactive: false },
            });

            assert.equal(result.status, 'FAILURE');
            assert.equal(
                result.metadata?.failure_code,
                'legacy_runtime_capability_retired_use_cstar_kernel',
            );
            assert.equal(result.metadata?.execution_dispatched, false);
            assert.equal(result.metadata?.hall_mutation_started, false);
            assert.equal(result.metadata?.provider_attempted, false);
            assert.equal(result.metadata?.process_started, false);
            assert.equal(result.metadata?.source_access_started, false);
        }
    });
});
