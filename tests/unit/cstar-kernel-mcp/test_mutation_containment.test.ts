import { describe, it } from 'node:test';
import {
    assert,
    beadStore,
    database,
    handleBead,
    handleRecordResult,
} from './shared_test_setup.js';

describe('CStar MCP mutation containment', () => {
    it('rejects duplicate bead creates and terminal initial statuses', async () => {
        await handleBead({
            action: 'create',
            bead_id: 'bead:mcp:duplicate',
            rationale: 'Original bead.',
        });
        const duplicate = await handleBead({
            action: 'create',
            bead_id: 'bead:mcp:duplicate',
            rationale: 'Must not overwrite the original.',
        });
        assert.strictEqual(duplicate.isError, true);
        assert.match(JSON.parse(duplicate.content[0].text).error, /already exists/);

        for (const status of ['RESOLVED', 'ARCHIVED', 'SUPERSEDED'] as const) {
            const terminal = await handleBead({
                action: 'create',
                bead_id: `bead:mcp:terminal-${status.toLowerCase()}`,
                rationale: 'Terminal creation must fail.',
                status,
            });
            assert.strictEqual(terminal.isError, true);
            assert.match(JSON.parse(terminal.content[0].text).error, /terminal initial status/);
        }
    });

    it('forces bead claims to IN_PROGRESS and rejects terminal beads', async () => {
        await handleBead({
            action: 'create',
            bead_id: 'bead:mcp:claim-status',
            rationale: 'Exercise claim status containment.',
        });
        const invalidStatus = await handleBead({
            action: 'claim',
            bead_id: 'bead:mcp:claim-status',
            assigned_agent: 'codex',
            status: 'BLOCKED',
        });
        assert.strictEqual(invalidStatus.isError, true);
        assert.match(JSON.parse(invalidStatus.content[0].text).error, /always transitions to IN_PROGRESS/);

        beadStore.set('bead:mcp:terminal-claim', {
            id: 'bead:mcp:terminal-claim',
            repo_id: 'test-repo',
            status: 'RESOLVED',
            target_kind: 'OTHER',
            rationale: 'Already terminal.',
            contract_refs: [],
            baseline_scores: {},
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        const terminalClaim = await handleBead({
            action: 'claim',
            bead_id: 'bead:mcp:terminal-claim',
            assigned_agent: 'codex',
        });
        assert.strictEqual(terminalClaim.isError, true);
        assert.match(JSON.parse(terminalClaim.content[0].text).error, /Cannot claim terminal bead/);
    });

    it('reports result persistence failure honestly and skips secondary observation', async () => {
        const originalSaveValidationRun = database.saveValidationRun;
        (database.saveValidationRun as any) = () => {
            throw new Error('synthetic validation write failure');
        };
        try {
            const result = await handleRecordResult({
                bead_id: 'test-bead-persistence-failure',
                verdict: 'SUCCESS',
                token_path_observation: {
                    scenario_class: 'BUILD',
                    selected_policy: 'lite-only',
                    advised_mode: 'lite',
                },
            });
            assert.strictEqual(result.isError, true);
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(parsed.status, 'not_recorded');
            assert.deepStrictEqual(parsed.error, {
                code: 'PERSISTENCE_FAILED',
                message: 'Validation result was not persisted.',
                retryable: true,
            });
            assert.ok(
                !JSON.stringify(parsed).includes('synthetic validation write failure'),
                'internal persistence details must not escape through the MCP result',
            );
            assert.strictEqual(parsed.mutation.persisted, false);
            assert.strictEqual(parsed.token_path_observation_status, 'not_recorded');
            assert.strictEqual(parsed.token_path_observation_id, undefined);
            assert.strictEqual(parsed.token_path_observation_warning, 'validation_persistence_failed');
        } finally {
            (database.saveValidationRun as any) = originalSaveValidationRun;
        }
    });
});
