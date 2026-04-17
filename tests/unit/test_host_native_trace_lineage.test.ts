import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import { getHallBead } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

function assertAuguryContractIncludesCoreFields(actual: unknown, expected: Record<string, unknown>): void {
    assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual));
    assert.deepEqual(
        Object.fromEntries(Object.keys(expected).map((key) => [key, (actual as Record<string, unknown>)[key]])),
        expected,
    );
    assert.equal(typeof (actual as Record<string, unknown>).council_expert, 'object');
}

describe('host-native Augury lineage', () => {
    it('preserves planning lineage and designation source for inherited host-native skill dispatch', async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-trace-lineage-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'skill_registry.json'),
            JSON.stringify({
                entries: {
                    hall: {
                        execution: {
                            mode: 'agent-native',
                        },
                        host_support: {
                            codex: 'exec-bridge',
                        },
                        runtime_trigger: 'hall',
                    },
                },
            }),
            'utf-8',
        );
        registry.setRoot(tmpRoot);

        process.env.CODEX_SHELL = '1';
        process.env.CODEX_THREAD_ID = 'thread-trace-lineage';

        const hostTextInvoker = mock.fn(async () => ({
            provider: 'codex' as const,
            text: 'Host fulfilled hall lineage request.',
        }));
        const dispatcher = RuntimeDispatcher.createIsolated({
            // @ts-ignore
            stateRegistry: { updateMission: mock.fn(), updateFramework: mock.fn() },
            // @ts-ignore
            hostTextInvoker,
            activePersona: { name: 'ALFRED' },
        });

        const traceContract = {
            intent_category: 'ORCHESTRATE',
            intent: 'Carry planning lineage through host-native hall execution.',
            selection_tier: 'WEAVE',
            selection_name: 'orchestrate',
            trajectory_status: 'STABLE',
            trajectory_reason: 'Inherited designation must survive nested dispatch.',
            mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
            confidence: 0.91,
            canonical_intent: 'Carry planning lineage through host-native hall execution.',
        };

        try {
            const result = await dispatcher.dispatch({
                id: 'activation:hall:trace-lineage',
                skill_id: 'hall',
                target_path: 'src/core/host_session.ts',
                intent: 'Inspect host trace lineage',
                params: {
                    query: 'host trace lineage',
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                    planning_session_id: 'chant-session:TRACE-LINEAGE',
                    augury_contract: traceContract,
                    augury_designation_source: 'dispatcher_synthesized',
                },
                status: 'PENDING',
                priority: 1,
            });

            assert.strictEqual(result.status, 'SUCCESS');
            assert.strictEqual(result.output, 'Host fulfilled hall lineage request.');
            assert.strictEqual(result.metadata?.planning_session_id, 'chant-session:TRACE-LINEAGE');
            assert.strictEqual(result.metadata?.augury_designation_source, 'dispatcher_synthesized');
            assert.strictEqual(result.metadata?.trace_designation_source, 'dispatcher_synthesized');
            assertAuguryContractIncludesCoreFields(result.metadata?.augury_contract, traceContract);
            assertAuguryContractIncludesCoreFields(result.metadata?.trace_contract, traceContract);

            const executionBead = getHallBead(String(result.metadata?.execution_bead_id));
            assert.equal(executionBead?.metadata?.planning_session_id, 'chant-session:TRACE-LINEAGE');
            assert.equal(executionBead?.metadata?.augury_designation_source, 'dispatcher_synthesized');
            assert.equal(executionBead?.metadata?.trace_designation_source, 'dispatcher_synthesized');
            assertAuguryContractIncludesCoreFields(executionBead?.metadata?.augury_contract, traceContract);
            assertAuguryContractIncludesCoreFields(executionBead?.metadata?.trace_contract, traceContract);
            assert.strictEqual(hostTextInvoker.mock.callCount(), 1);
            const hostPrompt = String(hostTextInvoker.mock.calls[0]?.arguments[0]?.prompt ?? '');
            assert.match(hostPrompt, /\[CORVUS_STAR_AUGURY\]/);
            assert.match(hostPrompt, /Mode: lite/);
            assert.match(hostPrompt, /Council Expert: DEAN/);
            assert.match(hostPrompt, /Mimir's Well: src\/node\/core\/runtime\/dispatcher\.ts/);
            assert.match(hostPrompt, /Directive: Route only/i);
            assert.doesNotMatch(hostPrompt, /Corvus Standard:/);
            assert.doesNotMatch(hostPrompt, /Confidence:/);
            assertAuguryContractIncludesCoreFields(hostTextInvoker.mock.calls[0]?.arguments[0]?.metadata?.augury_contract, traceContract);
            assert.equal(hostTextInvoker.mock.calls[0]?.arguments[0]?.metadata?.augury_designation_source, 'dispatcher_synthesized');
            assert.equal(hostTextInvoker.mock.calls[0]?.arguments[0]?.metadata?.augury_learning_metadata?.confidence, 0.91);
            assert.equal(hostTextInvoker.mock.calls[0]?.arguments[0]?.metadata?.augury_learning_metadata?.steering_mode, 'lite');
            assert.equal(hostTextInvoker.mock.calls[0]?.arguments[0]?.metadata?.augury_learning_metadata?.session_id, 'chant-session:TRACE-LINEAGE');
        } finally {
            delete process.env.CODEX_SHELL;
            delete process.env.CODEX_THREAD_ID;
        }
    });
});
