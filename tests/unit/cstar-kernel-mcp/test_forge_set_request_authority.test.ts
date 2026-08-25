import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { beforeEach, describe, it, afterEach } from 'node:test';

import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeAuthorize } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { verifyForgeExecutionAuthorization } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execution_authority.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { isForgeAuthorityRevocation } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_revocation.js';
import { readForgeSetSignalFromMutationIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_set_manifest_signal.js';
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

const BEAD_ID = 'bead:cstar:operating-pipeline-v1-plain-set-test';
const DECISION_ID = 'decision:cstar-operating-pipeline-v1-plain-set-test';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('plain pending exact-SET Forge request authority', () => {
    it('rehydrates a historical SET across ordinary append-only root-session growth', async () => {
        const session = createSession({
            textParts: ['Set a new goal to prove the validity of the entire pipeline.'],
            timestamp: new Date(Date.now() - 10_000).toISOString(),
        });
        const initial = await verifyCodexRequestIdentity(
            validRequestContext(session.threadId, session.turnId),
        );
        appendUserMessage(session.sessionFile, randomUUID(), 'Continue the bounded work.',
            new Date(Date.parse(session.timestamp) + 1_000).toISOString());
        const originalReadSync = fs.readSync;
        let reads = 0;
        fs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
            const read = originalReadSync(...args);
            reads += 1;
            if (reads === 2) {
                appendUserMessage(session.sessionFile, randomUUID(), 'Report the result when ready.',
                    new Date(Date.parse(session.timestamp) + 2_000).toISOString());
            }
            return read;
        }) as typeof fs.readSync;
        try {
            const restored = readForgeSetSignalFromMutationIdentity({
                thread_id: initial.thread_id,
                turn_id: initial.turn_id,
                record_set_sha256: initial.turn_record_set_sha256,
            });
            assert.equal(restored.identity.turn_record_set_sha256,
                initial.turn_record_set_sha256);
            assert.equal(restored.signal.record_sha256, initial.turn_record_sha256);
            assert.ok(reads >= 5);
        } finally {
            fs.readSync = originalReadSync;
        }
    });

    it('authorizes once and permits later same-root structural execution authority', async () => {
        const value = setupRoot('plain-set-request');
        insertBead(value, BEAD_ID, DECISION_ID);
        const session = createSession({
            textParts: ['Set a new goal to prove the validity of the entire pipeline.'],
            timestamp: new Date(Date.now() - 10_000).toISOString(),
        });
        const initialContext = validRequestContext(session.threadId, session.turnId);
        const initialIdentity = await verifyCodexRequestIdentity(initialContext);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, BEAD_ID, DECISION_ID, session.threadId), initialContext,
        ));
        assert.equal(pending.status, 'pending_authorization_recorded', JSON.stringify(pending));
        assert.equal(pending.authorization_profile, 'root_user_forge_intent_v1');
        const request = getForgeRequest(value.db, pending.receipt_id)!;
        assert.equal(request.status, 'PENDING_AUTH');
        assert.equal(request.requester_thread_id, initialIdentity.thread_id);
        assert.equal(request.requester_turn_id, initialIdentity.turn_id);
        assert.equal(request.requester_record_set_sha256, initialIdentity.turn_record_set_sha256);

        const laterTurnId = randomUUID();
        appendUserMessage(
            session.sessionFile,
            laterTurnId,
            'Continue the bounded synthetic verification.',
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        const laterContext = validRequestContext(session.threadId, laterTurnId);
        const authorized = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, laterContext));
        assert.equal(authorized.status, 'authorized', JSON.stringify(authorized));
        assert.match(authorized.operator_authorization_ref, /^cstar-forge-set-request:[a-f0-9]{64}$/);
        assert.equal(authorized.forge_execution.attempted, false);
        assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id)?.operator_turn_id,
            session.turnId);

        const execution = await verifyForgeExecutionAuthorization(
            value.db,
            getForgeRequest(value.db, pending.receipt_id)!,
            authorized.operator_authorization_ref,
            laterContext,
        );
        assert.equal(execution.mode, 'autonomous_set_manifest_v1');
        assert.equal(execution.executor.thread_id, session.threadId);
        assert.equal(execution.executor.turn_id, laterTurnId);
        assert.equal(execution.continuation_fingerprint, null);
    });

    it('does not revoke a plain SET request for a generic workflow pause of work', async () => {
        assert.equal(
            isForgeAuthorityRevocation(
                'Pause work at a good step so I can restart Codex to restart the MCP server.',
            ),
            false,
        );
        assert.equal(isForgeAuthorityRevocation('Pause the Forge work until later.'), true);
        assert.equal(isForgeAuthorityRevocation('Cancel work until later.'), true);

        const value = setupRoot('plain-set-request-workflow-pause');
        insertBead(value, BEAD_ID, DECISION_ID);
        const session = createSession({
            textParts: ['Set a new goal to prove the validity of the entire pipeline.'],
            timestamp: new Date(Date.now() - 10_000).toISOString(),
        });
        const initialContext = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, BEAD_ID, DECISION_ID, session.threadId), initialContext,
        ));
        const laterTurnId = randomUUID();
        appendUserMessage(
            session.sessionFile,
            laterTurnId,
            'Pause work at a good step so I can restart Codex to restart the MCP server.',
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        const authorized = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, validRequestContext(session.threadId, laterTurnId)));
        assert.equal(authorized.status, 'authorized', JSON.stringify(authorized));
        assert.match(authorized.operator_authorization_ref, /^cstar-forge-set-request:[a-f0-9]{64}$/);
    });
});
