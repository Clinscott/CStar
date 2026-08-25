import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    insertBead,
    parse,
    requestArgs,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('default Forge request authorization seam', () => {
    it('auto-binds one exact receipt directive without exposing the compatibility authorizer', async () => {
        const value = setupRoot('auto-authorize-exact');
        const beadId = 'bead:test:auto-authorize-exact';
        const decisionId = 'decision:test:auto-authorize-exact';
        insertBead(value, beadId);
        const session = createSession({ textParts: ['Informational context only.'] });
        const args = requestArgs(value, beadId, decisionId, session.threadId);
        const pending = parse(await handleForgeRequest(
            args,
            validRequestContext(session.threadId, session.turnId),
        ));
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            `Authorize and execute only ${pending.receipt_id} with request SHA-256 ${pending.request_sha256} for ${beadId} now`,
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );

        const result = parse(await handleForgeRequest(
            args,
            validRequestContext(session.threadId, session.turnId),
        ));

        assert.equal(result.status, 'authorized_request_replayed', JSON.stringify(result));
        assert.equal(result.request_status, 'AUTHORIZED');
        assert.equal(result.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(result.dispatch_execution.attempted, false);
        assert.equal(getForgeRequest(value.db, pending.receipt_id)?.status, 'AUTHORIZED');
        assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id)?.operator_record_count, 2);
        assert.equal(
            value.db.prepare('SELECT COUNT(*) FROM hall_forge_attempts').pluck().get(),
            0,
        );
    });

    it('auto-binds a positive conversational mission through the default request surface', async () => {
        const value = setupRoot('auto-authorize-conversational');
        const beadId = 'bead:test:auto-authorize-conversational';
        const decisionId = 'decision:test:auto-authorize-conversational';
        insertBead(value, beadId);
        const session = createSession({ textParts: ['Build the Moonshot PR 32 improvement.'] });
        const result = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId),
            validRequestContext(session.threadId, session.turnId),
        ));

        assert.equal(result.status, 'authorized_request_replayed', JSON.stringify(result));
        assert.equal(result.request_status, 'AUTHORIZED');
        assert.equal(result.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(result.dispatch_execution.attempted, false);
        assert.equal(getForgeAuthorizationByRequest(value.db, result.receipt_id)?.operator_record_count, 1);
        assert.equal(
            value.db.prepare('SELECT COUNT(*) FROM hall_forge_attempts').pluck().get(),
            0,
        );
    });

    it('keeps a non-operative conversational continuation pending with zero spend', async () => {
        const value = setupRoot('auto-authorize-pending');
        const beadId = 'bead:test:auto-authorize-pending';
        const decisionId = 'decision:test:auto-authorize-pending';
        insertBead(value, beadId);
        const session = createSession({ textParts: ['Correct. Then work until the pipeline is verified.'] });

        const result = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId),
            validRequestContext(session.threadId, session.turnId),
        ));

        assert.equal(result.status, 'pending_authorization_recorded');
        assert.equal(result.request_status, 'PENDING_AUTH');
        assert.equal(result.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(result.dispatch_execution.attempted, false);
        assert.equal(getForgeAuthorizationByRequest(value.db, result.receipt_id), null);
        assert.equal(
            value.db.prepare('SELECT COUNT(*) FROM hall_forge_attempts').pluck().get(),
            0,
        );
    });

    it('does not reuse one conversational turn for a later request', async () => {
        const value = setupRoot('auto-authorize-one-shot');
        const firstBeadId = 'bead:test:auto-authorize-one-shot-first';
        const secondBeadId = 'bead:test:auto-authorize-one-shot-second';
        insertBead(value, firstBeadId);
        insertBead(value, secondBeadId);
        const session = createSession({ textParts: ['Build the Moonshot PR 32 improvement.'] });
        const context = validRequestContext(session.threadId, session.turnId);
        const first = parse(await handleForgeRequest(
            requestArgs(value, firstBeadId, 'decision:test:auto-authorize-one-shot-first', session.threadId),
            context,
        ));
        const second = parse(await handleForgeRequest(
            requestArgs(value, secondBeadId, 'decision:test:auto-authorize-one-shot-second', session.threadId),
            context,
        ));

        assert.equal(first.request_status, 'AUTHORIZED');
        assert.equal(second.request_status, 'PENDING_AUTH', JSON.stringify(second));
        assert.equal(getForgeAuthorizationByRequest(value.db, first.receipt_id) !== null, true);
        assert.equal(getForgeAuthorizationByRequest(value.db, second.receipt_id), null);
        assert.equal(
            value.db.prepare('SELECT COUNT(*) FROM hall_forge_attempts').pluck().get(),
            0,
        );
    });
});
