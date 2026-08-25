import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SovereignBead } from '../../../src/types/bead.js';
import {
    classifyDurableWork,
    createPendingSkillActivationRecord,
    planSkillActivationForBead,
} from '../../../src/node/core/runtime/skill_activation.js';
import { resolveExecutionRoute } from '../../../src/node/core/runtime/weaves/orchestrate_transitions.js';

function bead(overrides: Partial<SovereignBead> = {}): SovereignBead {
    return {
        id: 'bead:test:durable-routing',
        repo_id: 'repo:test',
        scan_id: 'scan:test',
        target_kind: 'OTHER',
        rationale: 'Classify this bounded work.',
        contract_refs: [],
        baseline_scores: {},
        status: 'SET',
        assigned_agent: 'ORIGINAL-ASSIGNEE',
        created_at: 1,
        updated_at: 1,
        ...overrides,
    };
}

describe('durable skill activation planning', () => {
    it('routes code, checker, documentation, and implementation-profile work to Forge requests', () => {
        const cases = [
            bead({ target_path: 'src/example.ts' }),
            bead({ checker_shell: 'npm test' }),
            bead({ target_path: 'docs/contract.md' }),
            bead({ target_kind: 'WORKFLOW', rationale: 'Build the bounded repair.' }),
        ];

        for (const candidate of cases) {
            assert.equal(classifyDurableWork(candidate), 'implementation');
            assert.equal(resolveExecutionRoute(candidate), 'cstar_forge_request');
        }
        assert.equal(
            resolveExecutionRoute(bead(), { execution_profile: 'implementation' }),
            'cstar_forge_request',
        );
    });

    it('routes evidence and critique work to Researcher requests', () => {
        const research = bead({ rationale: 'Research evidence for the operator decision.' });
        const critique = bead({ critique_payload: { targets: ['src/example.ts'] } });

        assert.equal(classifyDurableWork(research), 'evidence');
        assert.equal(resolveExecutionRoute(research), 'cstar_researcher_request');
        assert.equal(classifyDurableWork(critique), 'evidence');
        assert.equal(resolveExecutionRoute(critique), 'cstar_researcher_request');
    });

    it('fails closed for an unknown work class', () => {
        const unknown = bead({ target_kind: 'OTHER', target_ref: 'opaque:thing', rationale: 'Continue.' });
        const planned = planSkillActivationForBead(unknown);
        const record = createPendingSkillActivationRecord(
            unknown.repo_id,
            undefined,
            unknown,
            'activation:test',
            planned,
            123,
        );

        assert.equal(classifyDurableWork(unknown), 'unknown');
        assert.equal(resolveExecutionRoute(unknown), 'FAIL_CLOSED');
        assert.equal(planned.transition, 'FAILED_CLOSED');
        assert.equal(planned.adapter_id, 'operator-needed');
        assert.equal(planned.metadata.execution_dispatched, false);
        assert.equal(planned.metadata.provider_requests_started, 0);
        assert.equal(record.status, 'FAILED');
        assert.equal(record.error_text, 'durable_work_classification_unknown');
    });

    it('persists known work as an operator-needed pending activation with zero execution', () => {
        const implementation = bead({ target_path: 'src/example.ts' });
        const planned = planSkillActivationForBead(implementation);
        const record = createPendingSkillActivationRecord(
            implementation.repo_id,
            'planning-session:test',
            implementation,
            'activation:test',
            planned,
            123,
        );

        assert.equal(record.status, 'PENDING');
        assert.equal(record.skill_id, 'cstar_forge_request');
        assert.equal(record.adapter_id, 'operator-needed');
        assert.equal(record.role, 'operator');
        assert.equal(record.metadata?.checker_execution_started, false);
        assert.equal(record.metadata?.source_execution_started, false);
        assert.equal(record.metadata?.git_actions_started, false);
    });
});
