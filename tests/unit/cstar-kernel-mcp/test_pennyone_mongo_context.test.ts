import { describe, it } from 'node:test';
import {
    assert,
    mock,
    database,
    beadStore,
    handlePennyOneContext,
    handleMongoMailbox,
} from './shared_test_setup.js';

describe('CStar MCP PennyOne and Mongo bounded data surfaces', () => {
    it('cstar_pennyone_context reports bounded status without arbitrary SQL', async () => {
        const result = await handlePennyOneContext({ action: 'status' });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.source, 'pennyone_sqlite');
        assert.strictEqual(parsed.arbitrary_sql_allowed, false);
        assert.ok(parsed.table_counts);
        assert.strictEqual(parsed.guardrail.verdict, 'allow');
    });

    it('cstar_pennyone_context returns filtered bead summaries', async () => {
        beadStore.set('bead-a', {
            id: 'bead-a',
            status: 'OPEN',
            target_kind: 'FILE',
            target_ref: 'src/a.ts',
            rationale: 'Open work',
            updated_at: 10,
        });
        beadStore.set('bead-b', {
            id: 'bead-b',
            status: 'RESOLVED',
            target_kind: 'FILE',
            target_ref: 'src/b.ts',
            rationale: 'Done work',
            updated_at: 20,
        });
        const result = await handlePennyOneContext({ action: 'bead_summary', statuses: ['OPEN'], limit: 10 });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'ok');
        assert.strictEqual(parsed.count, 1);
        assert.strictEqual(parsed.beads[0].bead_id, 'bead-a');
    });

    it('cstar_pennyone_context validation summary requires explicit bead scope', async () => {
        const original = database.getValidationRuns;
        mock.method(database, 'getValidationRuns', (beadId: string) => [
            { validation_id: 'val-1', bead_id: beadId, verdict: 'SUCCESS', validator: 'test', created_at: 1, summary: 'ok' },
        ]);
        try {
            const empty = await handlePennyOneContext({ action: 'validation_summary' });
            const emptyParsed = JSON.parse(empty.content[0].text);
            assert.strictEqual(emptyParsed.count, 0);
            assert.match(emptyParsed.next_action, /Provide bead_id/);

            const scoped = await handlePennyOneContext({ action: 'validation_summary', bead_id: 'bead-a' });
            const scopedParsed = JSON.parse(scoped.content[0].text);
            assert.strictEqual(scopedParsed.count, 1);
            assert.strictEqual(scopedParsed.validations[0].validation_id, 'val-1');
        } finally {
            (database.getValidationRuns as any) = original;
        }
    });

    it('cstar_pennyone_context returns repository and mounted-spoke summaries', async () => {
        const originalRepos = database.listHallRepositories;
        mock.method(database, 'listHallRepositories', () => [
            { repo_id: 'repo-1', root_path: '/repo/one', name: 'Repo One', status: 'active', updated_at: 123 },
        ]);
        try {
            const result = await handlePennyOneContext({ action: 'repository_summary' });
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(parsed.status, 'ok');
            assert.strictEqual(parsed.repositories[0].repo_id, 'repo-1');
            assert.deepStrictEqual(parsed.mounted_spokes, []);
            assert.strictEqual(parsed.guardrail.verdict, 'allow');
        } finally {
            (database.listHallRepositories as any) = originalRepos;
        }
    });

    it('cstar_mongo_mailbox retires every compatibility action before secret or network use', async () => {
        for (const action of ['status', 'mirror_counts', 'enqueue_operator_intent'] as const) {
            const result = await handleMongoMailbox({
                action,
                intent_action: 'accept',
                proposal_id: 'proposal-1',
                operator_authorization_ref: 'caller-text-is-not-authority',
            });
            const parsed = JSON.parse(result.content[0].text);
            assert.strictEqual(result.isError, true);
            assert.strictEqual(parsed.error, 'legacy_mongo_mailbox_retired_use_cstar_kernel_hall_surfaces');
            assert.strictEqual(parsed.status, 'retired');
            assert.strictEqual(parsed.requested_action, action);
            assert.strictEqual(parsed.actuated, false);
            assert.strictEqual(parsed.network_accessed, false);
            assert.strictEqual(parsed.secret_source_read, false);
        }
    });
});
