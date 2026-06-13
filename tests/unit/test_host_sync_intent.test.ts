import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapIntentToArgv, isIntentAction } from '../../src/node/sync/intent.js';

describe('host sync worker — intent → CLI argv mapping', () => {
    it('maps accept/decline/refine/dispatch with notes', () => {
        for (const action of ['accept', 'decline', 'refine', 'dispatch'] as const) {
            const argv = mapIntentToArgv({ action, proposal_id: 'P-1', payload: { notes: 'looks good' } });
            assert.deepEqual(argv, [action, '--id', 'P-1', '--notes', 'looks good']);
        }
    });

    it('defaults notes to empty string when payload is null', () => {
        const argv = mapIntentToArgv({ action: 'accept', proposal_id: 'P-2', payload: null });
        assert.deepEqual(argv, ['accept', '--id', 'P-2', '--notes', '']);
    });

    it('defaults notes to empty string when payload omits notes', () => {
        const argv = mapIntentToArgv({ action: 'decline', proposal_id: 'P-3', payload: {} });
        assert.deepEqual(argv, ['decline', '--id', 'P-3', '--notes', '']);
    });

    it('maps edit with a JSON-stringified payload spec and notes', () => {
        const spec = { title: 'New title', risk: 'low' };
        const argv = mapIntentToArgv({
            action: 'edit',
            proposal_id: 'P-4',
            payload: { payload: spec, notes: 'tightened scope' },
        });
        assert.deepEqual(argv, ['edit', '--id', 'P-4', '--payload', JSON.stringify(spec), '--notes', 'tightened scope']);
    });

    it('maps edit with empty notes when notes omitted', () => {
        const spec = { foo: 1 };
        const argv = mapIntentToArgv({ action: 'edit', proposal_id: 'P-5', payload: { payload: spec } });
        assert.deepEqual(argv, ['edit', '--id', 'P-5', '--payload', JSON.stringify(spec), '--notes', '']);
    });

    it('keeps operator strings as discrete argv elements (no shell injection surface)', () => {
        const nasty = '"; rm -rf / #';
        const argv = mapIntentToArgv({ action: 'refine', proposal_id: 'P-6', payload: { notes: nasty } });
        // The dangerous string is a single argv element — never concatenated into a command line.
        assert.equal(argv[argv.length - 1], nasty);
        assert.equal(argv.length, 5);
    });

    it('rejects unsupported actions before shelling', () => {
        assert.throws(() => mapIntentToArgv({ action: 'delete', proposal_id: 'P-7', payload: null }), /Unsupported intent action/);
        assert.throws(() => mapIntentToArgv({ action: '', proposal_id: 'P-7', payload: null }), /Unsupported intent action/);
    });

    it('rejects intents missing a proposal_id', () => {
        assert.throws(
            () => mapIntentToArgv({ action: 'accept', proposal_id: '' as unknown as string, payload: null }),
            /missing a string proposal_id/,
        );
    });

    it('rejects edit intents missing the payload spec', () => {
        assert.throws(() => mapIntentToArgv({ action: 'edit', proposal_id: 'P-8', payload: null }), /requires a payload object/);
        assert.throws(() => mapIntentToArgv({ action: 'edit', proposal_id: 'P-8', payload: { notes: 'x' } }), /missing the `payload` spec/);
    });

    it('isIntentAction guards the closed set', () => {
        assert.equal(isIntentAction('accept'), true);
        assert.equal(isIntentAction('edit'), true);
        assert.equal(isIntentAction('promote'), false);
        assert.equal(isIntentAction(42), false);
    });
});
