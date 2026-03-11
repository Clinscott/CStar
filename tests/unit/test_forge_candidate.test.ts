import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createForgeCandidateRequest, createForgeCandidateResult } from '../../src/types/forge-candidate.ts';

describe('Forge candidate contract (CS-P1-06)', () => {
    it('creates a canonical request with stable defaults', () => {
        const request = createForgeCandidateRequest({
            bead_id: 'bead-1',
            repo_id: 'repo-1',
            scan_id: 'scan-1',
            target_path: 'src/core/forge_target.py',
            rationale: 'Refactor the forge target.',
        });

        assert.strictEqual(request.request_source, 'bead');
        assert.deepStrictEqual(request.contract_refs, []);
        assert.deepStrictEqual(request.baseline_scores, {});
        assert.deepStrictEqual(request.operator_constraints, {});
        assert.deepStrictEqual(request.trace_metadata, {});
        assert.ok(request.created_at > 0);
    });

    it('creates a canonical result with generated tests and validations attached', () => {
        const result = createForgeCandidateResult({
            status: 'STAGED',
            candidate_id: 'candidate-1',
            bead_id: 'bead-1',
            target_path: 'src/core/forge_target.py',
            staged_path: '.agents/forge_staged/candidate_1__forge_target.py',
            candidate_patch: 'patch-body',
            candidate_content: 'def execute(args):\n    return None\n',
            summary: 'Forge target refactor candidate',
            generated_tests: [
                {
                    path: 'tests/gauntlet/test_forge_target.py',
                    reason: 'Regression gauntlet',
                    contract_refs: ['contracts:forge-target'],
                    template: 'gauntlet',
                },
            ],
            required_validations: ['crucible', 'generated_tests'],
            validation_request: {
                bead_id: 'bead-1',
                candidate_id: 'candidate-1',
                repo_id: 'repo-1',
                scan_id: 'scan-1',
                target_path: 'src/core/forge_target.py',
                staged_path: '.agents/forge_staged/candidate_1__forge_target.py',
                contract_refs: ['contracts:forge-target'],
                acceptance_criteria: 'Raise the baseline above 5.0.',
                required_validations: ['crucible', 'generated_tests'],
                baseline_scores: { overall: 2.3 },
                generated_tests: [
                    {
                        path: 'tests/gauntlet/test_forge_target.py',
                        reason: 'Regression gauntlet',
                        contract_refs: ['contracts:forge-target'],
                        template: 'gauntlet',
                    },
                ],
            },
            trace_metadata: { request_source: 'bead' },
        });

        assert.strictEqual(result.generated_tests.length, 1);
        assert.deepStrictEqual(result.required_validations, ['crucible', 'generated_tests']);
        assert.deepStrictEqual(result.errors, []);
        assert.strictEqual(result.validation_request.acceptance_criteria, 'Raise the baseline above 5.0.');
        assert.strictEqual(result.validation_request.staged_path, '.agents/forge_staged/candidate_1__forge_target.py');
        assert.strictEqual(result.validation_request.generated_tests[0]?.path, 'tests/gauntlet/test_forge_target.py');
        assert.strictEqual(result.trace_metadata.request_source, 'bead');
    });
});
