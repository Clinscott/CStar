import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from '../../../src/node/core/runtime/reaper.js';
import { deps, OrchestratorTelemetryBridge } from '../../../src/node/core/runtime/telemetry.js';


describe('retired Orchestrator Telemetry', () => {
    it('has no database dependency and rejects heartbeat writes', async () => {
        assert.deepEqual(deps, { lifecycleAuthority: 'cstar-kernel' });
        await assert.rejects(
            () => new OrchestratorTelemetryBridge('/synthetic').pulse('bead:synthetic'),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
    });

    it('rejects validation-row writes', async () => {
        await assert.rejects(
            () => new OrchestratorTelemetryBridge('/synthetic').recordExecution(
                'bead:synthetic',
                { status: 'SUCCESS', exit_code: 0, duration_ms: 1 },
            ),
            { message: RETIRED_ORCHESTRATOR_RUNTIME_ERROR },
        );
    });
});
