import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ArtifactForgeWeave } from '../../../../src/node/core/runtime/host_workflows/artifact_forge.js';
import { EstateExpansionWeave } from '../../../../src/node/core/runtime/host_workflows/expansion.js';
import { RestorationWeave } from '../../../../src/node/core/runtime/host_workflows/restoration.js';
import { TaliesinForgeWeave } from '../../../../src/node/core/runtime/host_workflows/taliesin_forge.js';
import { VigilanceWeave } from '../../../../src/node/core/runtime/host_workflows/vigilance.js';
import { DistillWeave } from '../../../../src/node/core/runtime/weaves/distill.js';
import { EngraveWeave } from '../../../../src/node/core/runtime/weaves/engrave.js';
import { EvolveWeave } from '../../../../src/node/core/runtime/weaves/evolve.js';
import { OrchestrateWeave } from '../../../../src/node/core/runtime/weaves/orchestrate.js';
import { TemporalLearningWeave } from '../../../../src/node/core/runtime/weaves/temporal_learning.js';

const CONTEXT = {
    mission_id: 'MISSION-RETIRED',
    trace_id: 'TRACE-RETIRED',
    persona: 'ALFRED',
    workspace_root: '/tmp/retired-workflow',
    env: {},
    timestamp: 1,
} as any;

const CASES = [
    ['weave:artifact-forge', ArtifactForgeWeave],
    ['weave:expansion', EstateExpansionWeave],
    ['weave:restoration', RestorationWeave],
    ['weave:taliesin-forge', TaliesinForgeWeave],
    ['weave:vigilance', VigilanceWeave],
    ['weave:distill', DistillWeave],
    ['weave:engrave', EngraveWeave],
    ['weave:evolve', EvolveWeave],
    ['weave:orchestrate', OrchestrateWeave],
    ['weave:temporal-learning', TemporalLearningWeave],
] as const;

describe('retired mutation runtime weaves', () => {
    for (const [weaveId, Adapter] of CASES) {
        it(`${weaveId} fails closed without execution`, async () => {
            const adapter = new (Adapter as any)();
            const result = await adapter.execute(
                { weave_id: weaveId, payload: {} },
                CONTEXT,
            );
            assert.equal(result.status, 'FAILURE');
            assert.equal(result.metadata?.decommissioned, true);
            assert.equal(result.metadata?.execution_attempted, false);
            assert.equal(result.metadata?.mutation_performed, false);
            assert.equal(result.metadata?.model_invoked, false);
        });
    }

    it('keeps every compatibility adapter free of model, process, and lifecycle mutation imports', () => {
        const files = [
            'host_workflows/artifact_forge.ts',
            'host_workflows/expansion.ts',
            'host_workflows/restoration.ts',
            'host_workflows/taliesin_forge.ts',
            'host_workflows/vigilance.ts',
            'weaves/distill.ts',
            'weaves/engrave.ts',
            'weaves/evolve.ts',
            'weaves/orchestrate.ts',
            'weaves/temporal_learning.ts',
        ];
        for (const relative of files) {
            const source = fs.readFileSync(
                path.join(import.meta.dirname, '..', '..', '..', '..', 'src', 'node', 'core', 'runtime', relative),
                'utf-8',
            );
            assert.doesNotMatch(source, /\bexeca\b|hostTextInvoker|getDb\(|saveHall|upsertHall|dispatchPort\.dispatch|subprocess/);
        }
    });
});
