import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import { inheritTraceSkillBead } from '../../src/node/core/runtime/trace_inheritance.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

function assertContractFields(actual: unknown, expected: Record<string, unknown>): void {
    assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual));
    assert.deepEqual(
        Object.fromEntries(Object.keys(expected).map((key) => [key, (actual as Record<string, unknown>)[key]])),
        expected,
    );
}

describe('host-native Augury lineage', () => {
    it('preserves pure lineage metadata while the retired dispatcher performs zero host dispatch', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-trace-lineage-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    hall: {
                        entry_surface: 'host-only',
                        execution: {
                            mode: 'agent-native',
                            ownership_model: 'host-workflow',
                        },
                        host_support: { codex: 'exec-bridge' },
                        runtime_trigger: 'hall',
                    },
                },
            }),
            'utf-8',
        );
        registry.setRoot(tmpRoot);

        const previousCodexShell = process.env.CODEX_SHELL;
        const previousThreadId = process.env.CODEX_THREAD_ID;
        const previousProjectRoot = process.env.CSTAR_PROJECT_ROOT;
        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-trace-lineage';
        process.env.CSTAR_PROJECT_ROOT = tmpRoot;

        const hostTextInvoker = mock.fn(async () => ({
            provider: 'codex' as const,
            text: 'This must never be returned.',
        }));
        const dispatcher = RuntimeDispatcher.createIsolated({ hostTextInvoker });
        const traceContract = {
            intent_category: 'ORCHESTRATE',
            intent: 'Carry planning lineage without executing a retired adapter.',
            selection_tier: 'WEAVE',
            selection_name: 'orchestrate',
            trajectory_status: 'STABLE',
            trajectory_reason: 'Lineage metadata is pure data, not dispatch authority.',
            mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
            confidence: 0.91, // Historical unscored input; inheritance must remove it.
            canonical_intent: 'Carry planning lineage without executing a retired adapter.',
        };
        const inheritedContract = {
            intent_category: traceContract.intent_category,
            intent: traceContract.intent,
            selection_tier: traceContract.selection_tier,
            selection_name: traceContract.selection_name,
            trajectory_status: traceContract.trajectory_status,
            trajectory_reason: traceContract.trajectory_reason,
            mimirs_well: traceContract.mimirs_well,
            canonical_intent: traceContract.canonical_intent,
        };
        const bead = inheritTraceSkillBead({
            id: 'activation:hall:trace-lineage',
            skill_id: 'hall',
            target_path: 'src/core/host_session.ts',
            intent: 'Inspect host trace lineage',
            params: { query: 'host trace lineage' },
            status: 'PENDING' as const,
            priority: 1,
        }, {
            augury_contract: traceContract,
            augury_designation_source: 'dispatcher_synthesized',
            session_id: 'chant-session:TRACE-LINEAGE',
        });

        try {
            assert.equal(bead.params.planning_session_id, 'chant-session:TRACE-LINEAGE');
            assert.equal(bead.params.augury_designation_source, 'dispatcher_synthesized');
            assert.equal(bead.params.trace_designation_source, 'dispatcher_synthesized');
            assertContractFields(bead.params.augury_contract, inheritedContract);
            assertContractFields(bead.params.trace_contract, inheritedContract);
            assert.equal(bead.params.augury_contract.confidence, undefined);
            assert.equal(bead.params.trace_contract.confidence, undefined);

            const result = await dispatcher.dispatch(bead);
            assert.equal(result.status, 'FAILURE');
            assert.match(result.error ?? '', /host-only.*active host conversation/i);
            assert.equal(result.metadata?.failure_code, 'runtime_host_only_requires_active_host');
            assert.equal(result.metadata?.execution_dispatched, false);
            assert.equal(result.metadata?.hall_mutation_started, false);
            assert.equal(result.metadata?.provider_attempted, false);
            assert.equal(result.metadata?.process_started, false);
            assert.equal(result.metadata?.source_access_started, false);
            assert.equal(hostTextInvoker.mock.callCount(), 0);
        } finally {
            if (previousCodexShell === undefined) delete process.env.CODEX_SHELL;
            else process.env.CODEX_SHELL = previousCodexShell;
            if (previousThreadId === undefined) delete process.env.CODEX_THREAD_ID;
            else process.env.CODEX_THREAD_ID = previousThreadId;
            if (previousProjectRoot === undefined) delete process.env.CSTAR_PROJECT_ROOT;
            else process.env.CSTAR_PROJECT_ROOT = previousProjectRoot;
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
