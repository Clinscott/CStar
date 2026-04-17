import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enrichTraceContractWithCouncil, scoreCouncilExpertCandidates, selectCouncilExpert } from '../../src/core/council_experts.js';

describe('Council experts', () => {
    it('selects the Carmack protocol for game and RPG code work', () => {
        const expert = selectCouncilExpert({
            intent_category: 'BUILD',
            selection_name: 'creation_loop',
            intent: 'Implement Fallows Hallow RPG combat engine code and render loop fixes.',
            mimirs_well: ['FallowsHallowRPG/src/combat/engine.ts'],
        });

        assert.equal(expert.id, 'carmack');
        assert.equal(expert.label, 'CARMACK');
        assert.ok((expert.selection_score ?? 0) >= 10);
        assert.match(expert.selection_reason ?? '', /game|RPG|engine/i);
        assert.equal(expert.selection_candidates?.[0]?.id, 'carmack');
    });

    it('selects the Karpathy protocol for persona and AI-system work', () => {
        const expert = selectCouncilExpert({
            intent_category: 'BUILD',
            selection_name: 'persona',
            intent: 'Improve council persona selection through the Augury gate for AI inference and model-backed agents.',
        });

        assert.equal(expert.id, 'karpathy');
        assert.equal(expert.label, 'KARPATHY');
        assert.match(expert.root_persona_directive, /AI systems engineer/i);
        assert.ok(expert.anti_behavior.some((entry) => /model output/i.test(entry)));
    });

    it('enriches trace contracts with the selected root persona overlay', () => {
        const contract = enrichTraceContractWithCouncil({
            intent_category: 'ORCHESTRATE',
            intent: 'Coordinate worker retries through leases.',
            selection_tier: 'WEAVE',
            selection_name: 'orchestrate',
            mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
        });

        assert.equal(contract.council_expert?.id, 'dean');
        assert.equal(contract.council_expert?.label, 'DEAN');
        assert.match(contract.council_expert?.selection_reason ?? '', /orchestration/i);
        assert.equal(contract.council_candidates?.[0]?.id, 'dean');
    });

    it('scores ambiguous Augury domains and preserves top candidates', () => {
        const candidates = scoreCouncilExpertCandidates({
            intent_category: 'ORCHESTRATE',
            selection_name: 'orchestrate',
            intent: 'Coordinate AI inference workers with retries, leases, telemetry, and prompt evals.',
            mimirs_well: ['src/node/core/runtime/dispatcher.ts'],
        });

        assert.equal(candidates[0]?.id, 'dean');
        assert.ok(candidates.some((candidate) => candidate.id === 'karpathy'));
        assert.ok(candidates.some((candidate) => candidate.id === 'shannon'));
        assert.ok(candidates.every((candidate, index) => index === 0 || candidate.score <= candidates[index - 1].score));
    });
});
