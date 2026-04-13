import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { enrichTraceContractWithCouncil, selectCouncilExpert } from '../../src/core/council_experts.js';

describe('Council experts', () => {
    it('selects the Karpathy protocol for persona and AI-system work', () => {
        const expert = selectCouncilExpert({
            intent_category: 'BUILD',
            selection_name: 'persona',
            intent: 'Improve council persona selection through the trace gate for model-backed agents.',
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
    });
});
