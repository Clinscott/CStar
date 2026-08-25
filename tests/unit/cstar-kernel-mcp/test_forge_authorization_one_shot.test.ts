import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { getForgeAuthorizationByRequest } from
    '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
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

describe('one-shot exact Forge authority', () => {
    it('does not reuse one mission grant for a sequential later request', async () => {
        const value = setupRoot('mission-one-shot');
        const beadId = 'bead:test:mission-one-shot';
        const missionDecision = 'decision:test:mission-one-shot';
        insertBead(value, beadId);
        const session = createSession({
            textParts: ['Status is informational.'],
            timestamp: new Date(Date.now() - 3_000).toISOString(),
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const first = parse(await handleForgeRequest(requestArgs(
            value, beadId, `${missionDecision}-i1-repair`, session.threadId,
        ), context));
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            `Continue and implement ${missionDecision} on ${beadId} now.`,
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        const firstGranted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: first.receipt_id,
            request_sha256: first.request_sha256,
        }, context));
        assert.equal(firstGranted.status, 'authorized', JSON.stringify(firstGranted));

        const second = parse(await handleForgeRequest(requestArgs(
            value, beadId, `${missionDecision}-i2-hardening`, session.threadId,
        ), context));
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: second.receipt_id,
            request_sha256: second.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_turn_already_consumed');
        assert.equal(getForgeAuthorizationByRequest(value.db, second.receipt_id), null);
    });

    it('does not reuse one exact-request turn for a sequential later receipt', async () => {
        const value = setupRoot('exact-request-one-shot');
        const beadId = 'bead:test:exact-request-one-shot';
        insertBead(value, beadId);
        const session = createSession({
            textParts: ['Status is informational.'],
            timestamp: new Date(Date.now() - 4_000).toISOString(),
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const first = parse(await handleForgeRequest(requestArgs(
            value, beadId, 'decision:test:exact-request-one-shot-i1-repair', session.threadId,
        ), context));
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            `Authorize and execute only ${first.receipt_id} with request SHA-256 ${first.request_sha256} for ${beadId} now.`,
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        const firstGranted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: first.receipt_id,
            request_sha256: first.request_sha256,
        }, context));
        assert.equal(firstGranted.status, 'authorized', JSON.stringify(firstGranted));

        const second = parse(await handleForgeRequest(requestArgs(
            value, beadId, 'decision:test:exact-request-one-shot-i2-hardening', session.threadId,
        ), context));
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            `Authorize and execute only ${second.receipt_id} with request SHA-256 ${second.request_sha256} for ${beadId} now.`,
            new Date(Date.parse(session.timestamp) + 2_000).toISOString(),
        );
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: second.receipt_id,
            request_sha256: second.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_turn_already_consumed');
        assert.equal(getForgeAuthorizationByRequest(value.db, second.receipt_id), null);
    });
});
