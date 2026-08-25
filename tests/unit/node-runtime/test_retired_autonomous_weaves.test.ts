import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { RavensAdapter } from '../../../src/node/core/runtime/adapters.js';
import { StartAdapter } from '../../../src/node/core/runtime/adapters/start_adapter.js';
import { ArchitectCompatibilityAdapter } from '../../../src/node/core/runtime/compat/architect.js';
import type { RuntimeAdapter, RuntimeContext } from '../../../src/node/core/runtime/contracts.js';
import { ArtifactForgeHostWorkflow } from '../../../src/node/core/runtime/host_workflows/artifact_forge.js';
import { ChantHostWorkflow } from '../../../src/node/core/runtime/host_workflows/chant.js';
import { CritiqueHostWorkflow } from '../../../src/node/core/runtime/host_workflows/critique.js';
import { EstateExpansionHostWorkflow } from '../../../src/node/core/runtime/host_workflows/expansion.js';
import { ResearchHostWorkflow, normalizeResearchResponse } from '../../../src/node/core/runtime/host_workflows/research.js';
import { RestorationHostWorkflow } from '../../../src/node/core/runtime/host_workflows/restoration.js';
import { TaliesinForgeHostWorkflow } from '../../../src/node/core/runtime/host_workflows/taliesin_forge.js';
import { VigilanceHostWorkflow } from '../../../src/node/core/runtime/host_workflows/vigilance.js';
import {
    RETIRED_AUTONOMOUS_RUNTIME_FAILURE,
} from '../../../src/node/core/runtime/retired_adapter.js';
import { DistillWeave } from '../../../src/node/core/runtime/weaves/distill.js';
import { DistillLessonsWeave } from '../../../src/node/core/runtime/weaves/distill_lessons.js';
import { EngraveWeave } from '../../../src/node/core/runtime/weaves/engrave.js';
import { EstateRitualWeave } from '../../../src/node/core/runtime/weaves/estate_ritual.js';
import { EvolveWeave } from '../../../src/node/core/runtime/weaves/evolve.js';
import { HarvestLessonsWeave } from '../../../src/node/core/runtime/weaves/harvest_lessons.js';
import { PennyOneAdapter } from '../../../src/node/core/runtime/weaves/pennyone.js';
import { RavensCycleWeave, RavensStageContractAdapter } from '../../../src/node/core/runtime/weaves/ravens_cycle.js';
import { TemporalLearningWeave } from '../../../src/node/core/runtime/weaves/temporal_learning.js';
import { WardenWeave } from '../../../src/node/core/runtime/weaves/warden.js';
import { RETIRED_SOVEREIGN_LOOP_FAILURE, SovereignLoop } from '../../../src/node/core/heartbeat.js';

const SYNTHETIC_ROOT = '/synthetic/cstar-retired-runtime';

function context(): RuntimeContext {
    return {
        mission_id: 'mission:synthetic',
        bead_id: 'bead:synthetic',
        trace_id: 'trace:synthetic',
        persona: 'none',
        workspace_root: SYNTHETIC_ROOT,
        operator_mode: 'automation',
        target_domain: 'brain',
        interactive: false,
        env: {},
        timestamp: 1,
    };
}

interface RetiredCase {
    name: string;
    expectedId: string;
    factory: (effect: () => never, effectPort: { dispatch: () => never }) => RuntimeAdapter<any>;
    payload?: Record<string, unknown>;
}

const cases: RetiredCase[] = [
    { name: 'StartAdapter', expectedId: 'weave:start', factory: (effect, port) => new StartAdapter(port as any, effect, effect) },
    { name: 'RavensAdapter', expectedId: 'weave:ravens', factory: (effect, port) => new RavensAdapter(port as any, effect, effect) },
    { name: 'ArchitectCompatibilityAdapter', expectedId: 'weave:architect', factory: (effect, port) => new ArchitectCompatibilityAdapter(port as any, effect) },
    { name: 'ArtifactForgeHostWorkflow', expectedId: 'weave:artifact-forge', factory: (effect) => new ArtifactForgeHostWorkflow(effect) },
    { name: 'TaliesinForgeHostWorkflow', expectedId: 'weave:taliesin-forge', factory: (effect) => new TaliesinForgeHostWorkflow(effect) },
    { name: 'ChantHostWorkflow', expectedId: 'weave:chant', factory: (effect, port) => new ChantHostWorkflow(port as any, effect) },
    { name: 'CritiqueHostWorkflow', expectedId: 'weave:critique', factory: (effect, port) => new CritiqueHostWorkflow(port as any, effect) },
    { name: 'ResearchHostWorkflow', expectedId: 'weave:research', factory: (effect, port) => new ResearchHostWorkflow(port as any, effect) },
    { name: 'EstateExpansionHostWorkflow', expectedId: 'weave:expansion', factory: (effect, port) => new EstateExpansionHostWorkflow(port as any, effect) },
    { name: 'RestorationHostWorkflow', expectedId: 'weave:restoration', factory: (effect, port) => new RestorationHostWorkflow(port as any, effect) },
    { name: 'VigilanceHostWorkflow', expectedId: 'weave:vigilance', factory: (effect, port) => new VigilanceHostWorkflow(port as any, effect) },
    { name: 'DistillWeave', expectedId: 'weave:distill', factory: (effect) => new DistillWeave(effect) },
    { name: 'DistillLessonsWeave', expectedId: 'weave:distill-lessons', factory: (effect, port) => new DistillLessonsWeave(port as any, effect) },
    { name: 'EngraveWeave', expectedId: 'weave:engrave', factory: () => new EngraveWeave() },
    { name: 'EstateRitualWeave', expectedId: 'weave:estate-ritual', factory: (_effect, port) => new EstateRitualWeave(port as any) },
    { name: 'EvolveWeave', expectedId: 'weave:evolve', factory: (effect, port) => new EvolveWeave(port as any, effect) },
    { name: 'HarvestLessonsWeave', expectedId: 'weave:harvest-lessons', factory: (effect, port) => new HarvestLessonsWeave(port as any, effect) },
    { name: 'PennyOneAdapter', expectedId: 'weave:pennyone', factory: () => new PennyOneAdapter() },
    { name: 'RavensCycleWeave', expectedId: 'weave:ravens-cycle', factory: (effect) => new RavensCycleWeave(effect) },
    { name: 'TemporalLearningWeave', expectedId: 'weave:temporal-learning', factory: () => new TemporalLearningWeave() },
    { name: 'WardenWeave', expectedId: 'weave:warden', factory: (effect, port) => new WardenWeave(port as any, effect) },
];

const effectFlags = [
    'execution_dispatched',
    'provider_attempted',
    'process_started',
    'source_access_started',
    'filesystem_access_started',
    'filesystem_mutation_started',
    'git_action_started',
    'hall_mutation_started',
    'state_registry_mutation_started',
    'callback_started',
    'timer_started',
    'listener_started',
    'network_started',
    'secret_access_started',
] as const;

describe('retired autonomous runtime adapters', () => {
    for (const entry of cases) {
        it(`${entry.name} fails before every effect boundary`, async () => {
            let attempts = 0;
            const effect = (): never => {
                attempts += 1;
                throw new Error('synthetic effect must not run');
            };
            const adapter = entry.factory(effect, { dispatch: effect });
            const result = await adapter.execute({
                weave_id: entry.expectedId,
                payload: entry.payload ?? {
                    action: 'run',
                    project_root: SYNTHETIC_ROOT,
                    cwd: SYNTHETIC_ROOT,
                    intent: 'synthetic',
                    bead: {},
                    research: {},
                    remote_url: 'https://invalid.example/never-read',
                },
            }, context());

            assert.equal(attempts, 0);
            assert.equal(result.weave_id, entry.expectedId);
            assert.equal(result.status, 'FAILURE');
            assert.equal(result.error, RETIRED_AUTONOMOUS_RUNTIME_FAILURE);
            assert.equal(result.metadata?.failure_code, RETIRED_AUTONOMOUS_RUNTIME_FAILURE);
            for (const flag of effectFlags) {
                assert.equal(result.metadata?.[flag], false, `${entry.name}:${flag}`);
            }
        });
    }

    it('retains only the deterministic Ravens stage schema adapter', async () => {
        const adapter = new RavensStageContractAdapter('validate');
        const result = await adapter.execute({
            weave_id: adapter.id,
            payload: {
                project_root: SYNTHETIC_ROOT,
                cwd: SYNTHETIC_ROOT,
                target: { target_kind: 'FILE', target_path: 'src/synthetic.ts', bead_id: 'bead:synthetic' },
                metadata: { fixture: true },
            },
        }, context());

        assert.equal(result.status, 'TRANSITIONAL');
        assert.equal(result.metadata?.contract_only, true);
        assert.equal(result.metadata?.execution_dispatched, false);
        assert.equal(result.metadata?.hall_mutation_started, false);
        assert.equal(result.metadata?.provider_attempted, false);
        assert.equal(result.metadata?.process_started, false);
        assert.equal(result.metadata?.source_access_started, false);
    });

    it('retains research response normalization as a pure schema helper', () => {
        assert.deepEqual(
            normalizeResearchResponse({ summary: '  bounded summary  ', research_artifacts: [' a ', '', 3] }),
            { summary: 'bounded summary', researchArtifacts: ['a'] },
        );
        assert.throws(
            () => normalizeResearchResponse({ summary: '', research_artifacts: [] }),
            /non-empty summary/,
        );
    });

    it('removes action-bearing imports and calls from every retired adapter source', () => {
        const projectRoot = process.cwd();
        const sources = [
            'src/node/core/runtime/adapters.ts',
            'src/node/core/runtime/adapters/start_adapter.ts',
            'src/node/core/runtime/compat/architect.ts',
            'src/node/core/runtime/host_workflows/artifact_forge.ts',
            'src/node/core/runtime/host_workflows/taliesin_forge.ts',
            'src/node/core/runtime/host_workflows/chant.ts',
            'src/node/core/runtime/host_workflows/critique.ts',
            'src/node/core/runtime/host_workflows/research.ts',
            'src/node/core/runtime/host_workflows/expansion.ts',
            'src/node/core/runtime/host_workflows/restoration.ts',
            'src/node/core/runtime/host_workflows/vigilance.ts',
            'src/node/core/runtime/weaves/distill.ts',
            'src/node/core/runtime/weaves/distill_lessons.ts',
            'src/node/core/runtime/weaves/engrave.ts',
            'src/node/core/runtime/weaves/estate_ritual.ts',
            'src/node/core/runtime/weaves/evolve.ts',
            'src/node/core/runtime/weaves/harvest_lessons.ts',
            'src/node/core/runtime/weaves/pennyone.ts',
            'src/node/core/runtime/weaves/ravens_cycle.ts',
            'src/node/core/runtime/weaves/temporal_learning.ts',
            'src/node/core/runtime/weaves/warden.ts',
            'src/node/core/heartbeat.ts',
        ];
        const forbidden = [
            /node:child_process/,
            /from ['"]execa['"]/,
            /from ['"]node:fs(?:\/promises)?['"]/,
            /tools\/pennyone\/intel\/database/,
            /\bfetch\s*\(/,
            /\bsetInterval\s*\(/,
            /\bsetTimeout\s*\(/,
            /\bStateRegistry\b/,
            /\bANS\b/,
            /\.dispatch\s*\(/,
            /\bsaveHall\w*\s*\(/,
            /\bupsertHall\w*\s*\(/,
        ];

        for (const source of sources) {
            const text = fs.readFileSync(path.join(projectRoot, source), 'utf8');
            for (const pattern of forbidden) {
                assert.doesNotMatch(text, pattern, `${source}:${pattern}`);
            }
        }
    });
});

describe('retired sovereign heartbeat', () => {
    it('throws before timers, listeners, filesystem access, or callbacks', async () => {
        await assert.rejects(
            SovereignLoop.initiate(),
            new RegExp(RETIRED_SOVEREIGN_LOOP_FAILURE),
        );
        assert.doesNotThrow(() => SovereignLoop.stop());
    });
});
