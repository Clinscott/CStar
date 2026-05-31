import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mirrorUpsertOp, mirrorBulkOps, extractProposals, reconcileFilter } from '../../src/node/sync/mirror.js';

describe('host sync worker — mirror export transform', () => {
    it('builds an upsert keyed by proposal_id carrying the full decoded row', () => {
        const row = {
            proposal_id: 'P-1',
            status: 'proposed',
            gate_status: 'gate_passed',
            risk: 'low',
            title: 'A thing',
            spoke: 'corvuseye',
            payload: { nested: true },
        };
        const op = mirrorUpsertOp(row);
        assert.deepEqual(op.filter, { proposal_id: 'P-1' });
        assert.deepEqual(op.update.$set, row);
    });

    it('re-stamps proposal_id into $set even if shadowed', () => {
        const op = mirrorUpsertOp({ proposal_id: 'P-9', title: 'x' });
        assert.equal(op.update.$set.proposal_id, 'P-9');
    });

    it('throws when proposal_id is missing or non-string', () => {
        assert.throws(() => mirrorUpsertOp({ title: 'no id' }), /missing a string proposal_id/);
        assert.throws(() => mirrorUpsertOp({ proposal_id: 123 as unknown as string }), /missing a string proposal_id/);
    });

    it('builds bulkWrite upsert ops for every proposal', () => {
        const ops = mirrorBulkOps([{ proposal_id: 'A' }, { proposal_id: 'B' }]);
        assert.equal(ops.length, 2);
        assert.deepEqual(ops[0], { updateOne: { filter: { proposal_id: 'A' }, update: { $set: { proposal_id: 'A' } }, upsert: true } });
    });

    it('extracts the proposals array from list --history JSON', () => {
        assert.deepEqual(extractProposals({ proposals: [{ proposal_id: 'X' }] }), [{ proposal_id: 'X' }]);
        assert.deepEqual(extractProposals(null), []);
        assert.deepEqual(extractProposals({ proposals: 'nope' }), []);
        assert.deepEqual(extractProposals({}), []);
    });

    it('builds a reconcile filter targeting stale proposal_ids', () => {
        const filter = reconcileFilter([{ proposal_id: 'A' }, { proposal_id: 'B' }, { title: 'no id' }]);
        assert.deepEqual(filter, { proposal_id: { $nin: ['A', 'B'] } });
    });
});
