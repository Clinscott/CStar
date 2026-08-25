import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_COUNCIL_EXPERT_IDS,
    enrichTraceContractWithCouncil,
    getCouncilExpertProtocol,
    scoreCouncilExpertCandidates,
    selectCouncilExpert,
} from '../../src/core/council_experts.js';
import type { CouncilExpertId } from '../../src/core/council_experts.js';

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
        assert.ok((scoreCouncilExpertCandidates({
            intent_category: 'BUILD',
            selection_name: 'creation_loop',
            intent: 'Implement Fallows Hallow RPG combat engine code and render loop fixes.',
            mimirs_well: ['FallowsHallowRPG/src/combat/engine.ts'],
        })[0]?.score ?? 0) >= 10);
        assert.match(expert.selection_reason ?? '', /game|RPG|engine/i);
        assert.equal('selection_score' in expert, false);
        assert.equal('selection_candidates' in expert, false);
    });

    it('selects the Karpathy protocol for persona and AI-system work', () => {
        const expert = selectCouncilExpert({
            intent_category: 'BUILD',
            selection_name: 'persona',
            intent: 'Improve council persona selection through the Augury gate for AI inference and model-backed agents.',
        });

        assert.equal(expert.id, 'karpathy');
        assert.equal(expert.label, 'KARPATHY');
        assert.match(expert.critique_instruction, /AI-systems critique/i);
        assert.ok(expert.anti_behavior.some((entry) => /model output/i.test(entry)));
        assert.equal('root_persona_directive' in expert, false);
    });

    it('enriches trace contracts with one advisory critique lens and no ranking', () => {
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
        assert.equal('council_candidates' in contract, false);
        assert.equal('selection_score' in (contract.council_expert ?? {}), false);
        assert.equal('root_persona_directive' in (contract.council_expert ?? {}), false);
    });

    it('scores ambiguous Augury domains only through the internal ranking helper', () => {
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

    it('keeps canonical protocols isolated from caller mutation', () => {
        const protocol = getCouncilExpertProtocol('hamilton');
        const originalGuardrail = protocol.anti_behavior[0];
        protocol.anti_behavior[0] = 'caller poison';
        assert.equal(getCouncilExpertProtocol('hamilton').anti_behavior[0], originalGuardrail);

        const selected = selectCouncilExpert({ intent_category: 'HARDEN', intent: 'Harden rollback invariants.' });
        selected.anti_behavior.push('caller poison');
        const selectedAgain = selectCouncilExpert({ intent_category: 'HARDEN', intent: 'Harden rollback invariants.' });
        assert.equal(selectedAgain.anti_behavior.includes('caller poison'), false);
        assert.equal('selection_candidates' in selectedAgain, false);
    });

    it('publishes an immutable default expert order', () => {
        assert.equal(Object.isFrozen(DEFAULT_COUNCIL_EXPERT_IDS), true);
        assert.throws(() => (DEFAULT_COUNCIL_EXPERT_IDS as CouncilExpertId[]).push('carmack'));
        assert.deepEqual(DEFAULT_COUNCIL_EXPERT_IDS, ['torvalds', 'karpathy', 'hamilton', 'shannon', 'dean']);
    });
});
