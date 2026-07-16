import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.ts';
import {
    finalizeExecutionResult,
    LEGACY_RUNTIME_LIFECYCLE_ERROR,
} from '../../src/node/core/runtime/dispatch_lifecycle.ts';
import {
    normalizeRuntimeFailureMessage,
    requireExplicitOperatorRecovery,
} from '../../src/node/core/runtime/failure_authority.ts';
import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.ts';

class ControlledAdapter implements RuntimeAdapter<Record<string, unknown>> {
    public readonly execute = mock.fn(async (
        _invocation: WeaveInvocation<Record<string, unknown>>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> => ({
        weave_id: this.id,
        status: 'SUCCESS',
        output: 'forbidden execution',
    }));

    public constructor(public readonly id: string) {}
}

describe('retired runtime failure authority boundary', () => {
    let root: string;
    let previousProjectRoot: string | undefined;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-runtime-failure-'));
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        process.env.CSTAR_PROJECT_ROOT = root;
    });

    afterEach(() => {
        if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
        else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
        fs.rmSync(root, { recursive: true, force: true });
    });

    function writeRegistry(entries: Record<string, unknown>): void {
        fs.writeFileSync(
            path.join(root, '.agents', 'skill_registry.json'),
            JSON.stringify({ entries }),
        );
    }

    function createDispatcher() {
        const hostTextInvoker = mock.fn(async () => {
            throw new Error('host callback must not execute');
        });
        const dispatcher = RuntimeDispatcher.createIsolated({ hostTextInvoker });
        return { dispatcher, hostTextInvoker };
    }

    it('rejects manual adapter registration without retaining or executing it', () => {
        const { dispatcher, hostTextInvoker } = createDispatcher();
        const adapter = new ControlledAdapter('weave:synthetic-kernel');

        assert.throws(
            () => dispatcher.registerAdapter(adapter),
            /legacy_runtime_adapter_registration_retired:weave:synthetic-kernel/,
        );
        assert.deepStrictEqual(dispatcher.listAdapterIds(), []);
        assert.equal(adapter.execute.mock.callCount(), 0);
        assert.equal(hostTextInvoker.mock.callCount(), 0);
    });

    it('refuses an explicitly CLI kernel record because the adapter allowlist is empty', async () => {
        writeRegistry({
            synthetic_kernel: {
                entry_surface: 'cli',
                execution: {
                    mode: 'kernel-backed',
                    ownership_model: 'kernel-primitive',
                    adapter_id: 'weave:synthetic-kernel',
                },
            },
        });
        const { dispatcher, hostTextInvoker } = createDispatcher();

        const result = await dispatcher.dispatch({
            id: 'activation:kernel:1',
            skill_id: 'synthetic_kernel',
            intent: 'attempt retired Node kernel dispatch',
            params: {},
            status: 'PENDING',
            priority: 1,
        });

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.metadata?.failure_code, 'runtime_adapter_not_registered');
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
        assert.equal(result.metadata?.provider_attempted, false);
        assert.equal(result.metadata?.process_started, false);
        assert.equal(result.metadata?.source_access_started, false);
        assert.equal(hostTextInvoker.mock.callCount(), 0);
    });

    it('blocks host-only records before callback or adapter execution', async () => {
        writeRegistry({
            synthetic_host: {
                entry_surface: 'host-only',
                execution: {
                    mode: 'agent-native',
                    ownership_model: 'host-workflow',
                    adapter_id: 'weave:synthetic-host',
                },
            },
        });
        const { dispatcher, hostTextInvoker } = createDispatcher();

        const result = await dispatcher.dispatch({
            id: 'activation:host:1',
            skill_id: 'synthetic_host',
            intent: 'attempt host-only Node dispatch',
            params: {},
            status: 'PENDING',
            priority: 1,
        });

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.metadata?.failure_code, 'runtime_host_only_requires_active_host');
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
        assert.equal(hostTextInvoker.mock.callCount(), 0);
    });

    it('blocks underspecified compatibility records before execution', async () => {
        writeRegistry({ synthetic_legacy: { execution: { mode: 'unknown' } } });
        const { dispatcher } = createDispatcher();

        const result = await dispatcher.dispatch({
            weave_id: 'synthetic_legacy',
            payload: {},
        });

        assert.equal(result.status, 'FAILURE');
        assert.equal(
            result.metadata?.failure_code,
            'legacy_runtime_capability_retired_use_cstar_kernel',
        );
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
    });

    it('fails closed for a missing registry record', async () => {
        writeRegistry({});
        const { dispatcher } = createDispatcher();

        const result = await dispatcher.dispatch({ weave_id: 'weave:missing', payload: {} });

        assert.equal(result.status, 'FAILURE');
        assert.equal(result.metadata?.failure_code, 'runtime_registry_entry_missing');
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
    });

    it('preserves explicit positive evidence in the standalone recovery helper', () => {
        const result = requireExplicitOperatorRecovery({
            weave_id: 'weave:synthetic',
            status: 'FAILURE',
            output: '',
            error: 'synthetic failure',
            metadata: {
                execution_dispatched: true,
                automatic_recovery_attempted: true,
            },
        }, 'hall_finalization', { executionDispatched: false });

        assert.equal(result.metadata?.execution_dispatched, true);
        assert.equal(result.metadata?.automatic_recovery_attempted, true);
        assert.equal(result.metadata?.operator_action_required, true);
    });

    it('normalizes Error, string, and structured failure values', () => {
        assert.equal(normalizeRuntimeFailureMessage(new Error('error value')), 'error value');
        assert.equal(normalizeRuntimeFailureMessage('string value'), 'string value');
        assert.equal(normalizeRuntimeFailureMessage({ message: 'object value' }), 'object value');
    });

    it('legacy finalization records nothing and returns the kernel-only lifecycle error', () => {
        const recordExecution = mock.fn();
        const result = finalizeExecutionResult({
            result: {
                weave_id: 'weave:synthetic',
                status: 'SUCCESS',
                output: 'execution output is preserved',
                metadata: { marker: 'preserved' },
            },
            executionDispatched: false,
            bead: lifecycleBead(root),
        }, recordExecution as never);

        assert.equal(recordExecution.mock.callCount(), 0);
        assert.equal(result.status, 'FAILURE');
        assert.equal(result.error, LEGACY_RUNTIME_LIFECYCLE_ERROR);
        assert.equal(result.output, 'execution output is preserved');
        assert.equal(result.metadata?.marker, 'preserved');
        assert.equal(result.metadata?.lifecycle_recorded, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
        assert.equal(result.metadata?.lifecycle_authority, 'cstar-kernel-mcp');
    });

    it('legacy finalization preserves an original execution failure without recording', () => {
        const recordExecution = mock.fn();
        const result = finalizeExecutionResult({
            result: {
                weave_id: 'weave:synthetic',
                status: 'FAILURE',
                output: 'bounded failure output',
                error: 'primary execution failure',
            },
            executionDispatched: false,
            bead: lifecycleBead(root),
        }, recordExecution as never);

        assert.equal(recordExecution.mock.callCount(), 0);
        assert.equal(result.status, 'FAILURE');
        assert.equal(result.error, 'primary execution failure');
        assert.equal(result.metadata?.failure_code, LEGACY_RUNTIME_LIFECYCLE_ERROR);
        assert.equal(result.metadata?.lifecycle_recorded, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
    });
});

function lifecycleBead(root: string) {
    const context: RuntimeContext = {
        mission_id: 'MISSION-SYNTHETIC',
        bead_id: 'bead:synthetic',
        trace_id: 'TRACE-SYNTHETIC',
        persona: '',
        workspace_root: root,
        operator_mode: 'subkernel',
        target_domain: 'brain',
        interactive: false,
        env: {},
        timestamp: Date.now(),
    };
    return {
        beadId: 'bead:synthetic:execution',
        weaveId: 'weave:synthetic',
        context,
        auguryContract: null,
        augurySource: null,
    };
}
