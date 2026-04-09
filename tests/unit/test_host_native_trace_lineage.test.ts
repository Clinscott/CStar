import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RuntimeDispatcher } from '../../src/node/core/runtime/dispatcher.js';
import { getHallBead } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';

describe('host-native trace lineage', () => {
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
                    trace_contract: traceContract,
                    trace_designation_source: 'dispatcher_synthesized',
                },
                status: 'PENDING',
                priority: 1,
            });

            assert.strictEqual(result.status, 'SUCCESS');
            assert.strictEqual(result.output, 'Host fulfilled hall lineage request.');
            assert.strictEqual(result.metadata?.planning_session_id, 'chant-session:TRACE-LINEAGE');
            assert.strictEqual(result.metadata?.trace_designation_source, 'dispatcher_synthesized');
            assert.deepEqual(result.metadata?.trace_contract, traceContract);

            const executionBead = getHallBead(String(result.metadata?.execution_bead_id));
            assert.equal(executionBead?.metadata?.planning_session_id, 'chant-session:TRACE-LINEAGE');
            assert.equal(executionBead?.metadata?.trace_designation_source, 'dispatcher_synthesized');
            assert.deepEqual(executionBead?.metadata?.trace_contract, traceContract);
            assert.strictEqual(hostTextInvoker.mock.callCount(), 1);
        } finally {
            delete process.env.CODEX_SHELL;
            delete process.env.CODEX_THREAD_ID;
        }
    });
});
