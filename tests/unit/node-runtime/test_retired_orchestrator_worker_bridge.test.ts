import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { persistDelegatedBranch } from '../../../src/node/core/runtime/host_workflows/delegated_request_results.js';
import { reconcileDelegatedWorkflowRequest } from '../../../src/node/core/runtime/host_workflows/delegated_request_reconciler.js';
import { OrchestratorProcessManager } from '../../../src/node/core/runtime/process_manager.js';
import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from '../../../src/node/core/runtime/reaper.js';
import { OrchestratorWorkerBridge } from '../../../src/node/core/runtime/worker_bridge.js';


const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');


describe('retired Orchestrator worker and reconciliation paths', () => {
    it('returns five false effect flags without invoking a runner', async () => {
        let runnerCalls = 0;
        const bridge = new OrchestratorWorkerBridge(
            '/synthetic',
            new OrchestratorProcessManager(),
            () => { runnerCalls += 1; },
        );
        const result = await bridge.executeBead('bead:synthetic', { timeout: 1 });
        assert.equal(result.stderr, 'legacy_orchestrator_worker_bridge_retired_use_cstar_forge');
        assert.deepEqual({
            execution_dispatched: result.execution_dispatched,
            hall_mutation_started: result.hall_mutation_started,
            provider_attempted: result.provider_attempted,
            process_started: result.process_started,
            source_access_started: result.source_access_started,
        }, {
            execution_dispatched: false,
            hall_mutation_started: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
        });
        assert.equal(runnerCalls, 0);
    });

    it('rejects delegated reconciliation and branch persistence before Hall access', async () => {
        await assert.rejects(
            () => reconcileDelegatedWorkflowRequest('/synthetic', {} as never, {}),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
        assert.throws(
            () => persistDelegatedBranch({} as never),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
    });

    it('effectful runtime sources contain no database, process, or filesystem imports', () => {
        const relatives = [
            'src/node/core/runtime/reaper.ts',
            'src/node/core/runtime/scheduler.ts',
            'src/node/core/runtime/telemetry.ts',
            'src/node/core/runtime/process_manager.ts',
            'src/node/core/runtime/episodic_memory.ts',
            'src/node/core/runtime/worker_bridge.ts',
            'src/node/core/runtime/host_workflows/delegated_request_reconciler.ts',
        ];
        const source = relatives.map((relative) => fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8')).join('\n');
        for (const forbidden of [
            'pennyone/intel/database',
            "from 'execa'",
            "from 'node:fs'",
            "from 'node:child_process'",
            'process.kill(',
            '.prepare(',
            '.writeFile',
        ]) {
            assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    });
});
