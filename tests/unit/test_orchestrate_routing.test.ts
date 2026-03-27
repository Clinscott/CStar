import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveExecutionRoute } from '../../src/node/core/runtime/weaves/orchestrate.js';

describe('Orchestrate routing policy', () => {
    it('prefers AutoBot for bounded code beads with executable validation', () => {
        const route = resolveExecutionRoute({
            id: 'bead-code',
            repo_id: 'repo:/tmp',
            scan_id: 'scan-1',
            target_kind: 'FILE',
            target_path: 'src/runtime/worker.ts',
            rationale: 'Implement the bounded code change.',
            contract_refs: ['tests/unit/worker.test.ts'],
            baseline_scores: {},
            acceptance_criteria: 'It works.',
            checker_shell: 'node scripts/run-tsx.mjs --test tests/unit/worker.test.ts',
            status: 'SET',
            created_at: Date.now(),
            updated_at: Date.now(),
        });

        assert.equal(route, 'AUTOBOT');
    });

    it('prefers host-worker for docs or architecture-heavy beads', () => {
        const route = resolveExecutionRoute({
            id: 'bead-docs',
            repo_id: 'repo:/tmp',
            scan_id: 'scan-1',
            target_kind: 'FILE',
            target_path: 'docs/architecture/plan.qmd',
            rationale: 'Document the architecture.',
            contract_refs: ['contracts:docs'],
            baseline_scores: {},
            acceptance_criteria: 'The architecture is explained.',
            checker_shell: '',
            architect_opinion: 'Cross-cutting architecture note required.',
            status: 'SET',
            created_at: Date.now(),
            updated_at: Date.now(),
        });

        assert.equal(route, 'HOST-WORKER');
    });

    it('honors explicit assigned-agent routing when already set', () => {
        const route = resolveExecutionRoute({
            id: 'bead-explicit',
            repo_id: 'repo:/tmp',
            scan_id: 'scan-1',
            target_kind: 'FILE',
            target_path: 'src/runtime/worker.ts',
            rationale: 'Keep the explicit assignment.',
            contract_refs: [],
            baseline_scores: {},
            status: 'SET',
            assigned_agent: 'ONE-MIND',
            created_at: Date.now(),
            updated_at: Date.now(),
        });

        assert.equal(route, 'ONE-MIND');
    });
});
