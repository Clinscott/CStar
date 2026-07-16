import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    CHANT_PLANNER_RETIRED_ERROR,
    runPlanningLoop,
} from '../../src/node/core/runtime/host_workflows/chant_planner.js';
import {
    CHANT_PLANNER_ARTIFACTS_RETIRED_ERROR,
    persistArchitectProposal,
    writePlanningSession,
} from '../../src/node/core/runtime/host_workflows/chant_planner_artifacts.js';
import {
    ARCHITECT_SERVICE_RETIRED_ERROR,
    executeArchitectService,
} from '../../src/node/core/runtime/host_workflows/architect_service.js';
import type {
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../../src/node/core/runtime/contracts.js';

class RejectDispatchPort implements RuntimeDispatchPort {
    public calls = 0;
    public async dispatch<T>(_invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        this.calls += 1;
        throw new Error('dispatch must not run');
    }
}

describe('retired Chant planner and architect implementation', () => {
    it('fails before research dispatch, source, Hall, or proposal files', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-chant-retired-'));
        try {
            const dispatch = new RejectDispatchPort();
            const context: RuntimeContext = {
                mission_id: 'mission:synthetic',
                trace_id: 'trace:synthetic',
                workspace_root: root,
                operator_mode: 'subkernel',
                target_domain: 'brain',
                interactive: false,
                env: { SYNTHETIC_SECRET: 'must-not-be-read' },
                timestamp: 1,
            };
            const result = await runPlanningLoop(
                dispatch,
                { weave_id: 'weave:chant', payload: { query: 'synthetic', project_root: root, cwd: root } },
                context,
            );
            assert.equal(result.status, 'FAILURE');
            assert.equal(result.error, CHANT_PLANNER_RETIRED_ERROR);
            assert.equal(result.metadata?.execution_dispatched, false);
            assert.equal(result.metadata?.provider_attempted, false);
            assert.equal(result.metadata?.source_access_started, false);
            assert.equal(result.metadata?.filesystem_effect_started, false);
            assert.equal(result.metadata?.hall_mutation_started, false);
            assert.equal(dispatch.calls, 0);
            assert.deepEqual(fs.readdirSync(root), []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('retires direct architect callbacks and artifact persistence', async () => {
        let callbackCalls = 0;
        const result = await executeArchitectService(
            { action: 'build_proposal', intent: 'synthetic', project_root: '/synthetic' },
            {
                mission_id: 'mission', trace_id: 'trace', workspace_root: '/synthetic',
                operator_mode: 'subkernel', target_domain: 'brain', interactive: false,
                env: {}, timestamp: 1,
            },
            async () => {
                callbackCalls += 1;
                return '{}';
            },
        );
        assert.equal(result.error, ARCHITECT_SERVICE_RETIRED_ERROR);
        assert.equal(result.metadata?.provider_attempted, false);
        assert.equal(result.metadata?.callback_invoked, false);
        assert.equal(callbackCalls, 0);
        assert.throws(
            () => persistArchitectProposal('/synthetic', 'repo', 'session', {}),
            new RegExp(CHANT_PLANNER_ARTIFACTS_RETIRED_ERROR),
        );
        assert.throws(
            () => writePlanningSession({}),
            new RegExp(CHANT_PLANNER_ARTIFACTS_RETIRED_ERROR),
        );
    });

    it('contains no dormant provider, persistence, or filesystem implementation', () => {
        const files = [
            'src/node/core/runtime/host_workflows/chant_planner.ts',
            'src/node/core/runtime/host_workflows/chant_planner_artifacts.ts',
            'src/node/core/runtime/host_workflows/architect_service.ts',
        ];
        const source = files.map((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');
        assert.doesNotMatch(source, /readFile|writeFile|mkdirSync|getWritableDb|saveHall|upsertHall|hostTextInvoker\s*\(|dispatchPort\.dispatch/);
    });
});
