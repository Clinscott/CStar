import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    classifyBoundForgeIntent,
    verifyCurrentForgeOperatorIntent,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_operator_intent_attestation.js';
import { resolveForgeOperatorWorkItem } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_operator_work_item_resolution.js';
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

describe('exact multi-record Forge authorization', () => {
    it('accepts only the two canonical bound sentences', () => {
        const binding = {
            request_id: `dispatch-forge-${'1'.repeat(32)}`,
            request_sha256: '2'.repeat(64),
            bead_id: 'bead:test:stable-bound-adversarial',
            decision_id: 'decision:test:stable-bound-adversarial-i2-path-outcomes',
        };
        const receipt = `Authorize and execute only ${binding.request_id} with request SHA-256 ${binding.request_sha256} for ${binding.bead_id} now`;
        const mission = `Continue and implement decision:test:stable-bound-adversarial on ${binding.bead_id} now`;
        assert.equal(classifyBoundForgeIntent(
            `  ${receipt.toUpperCase()}  . `, binding, 'exact_request_receipt',
        ).action, 'route_to_forge');
        assert.equal(classifyBoundForgeIntent(
            mission, binding, 'exact_mission_record',
        ).action, 'implement');

        for (const mode of ['exact_request_receipt', 'exact_mission_record'] as const) {
            const grant = mode === 'exact_request_receipt' ? receipt : mission;
            for (const [label, text] of [
                ['question', `${grant}?`],
                ['prefix', `Please ${grant}`],
                ['conditional', `If approval arrives, ${grant}`],
                ['example', `For example, ${grant}`],
                ['quoted', `"${grant}"`],
                ['negated prefix', `Do not proceed. ${grant}`],
                ['modal', `Maybe ${grant}`],
                ['report', `The report recommends ${grant}`],
                ['discussion', `We should discuss whether to ${grant}`],
                ['first-person negation', `I am not authorizing this. ${grant}`],
                ['no execution', `${grant} no execution`],
                ['no Forge work', `${grant} no Forge work`],
                ['without execution', `${grant} without execution`],
                ['but not', `${grant} but not`],
                ['however not', `${grant} however not`],
            ] as const) {
                assert.throws(
                    () => classifyBoundForgeIntent(text, binding, mode),
                    /nonoperative_text/,
                    `${mode} accepted ${label}`,
                );
            }
        }
    });

    it('preserves singleton ordinary-language authorization and replay behavior', async () => {
        const value = setupRoot('singleton-v1');
        const beadId = 'bead:test:natural-happy';
        const decisionId = 'decision:test:natural-happy';
        insertBead(value, beadId);
        const session = createSession({
            textParts: [`Build the Moonshot PR 32 improvement for ${beadId} and ${decisionId}.`],
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const attestation = await verifyCurrentForgeOperatorIntent(context);
        const userLine = fs.readFileSync(session.sessionFile, 'utf-8').trimEnd().split('\n')[1]!;
        const userRecord = JSON.parse(userLine);
        const recordSha256 = createHash('sha256').update(userLine, 'utf-8').digest('hex');
        const expectedMessageSha256 = createHash('sha256').update(JSON.stringify({
            schema: 'cstar.forge_operator_intent_message.v1',
            thread_id: session.threadId,
            turn_id: session.turnId,
            records: [{
                index: 0,
                record_sha256: recordSha256,
                content: userRecord.payload.content,
            }],
        }), 'utf-8').digest('hex');
        assert.equal(attestation.binding_mode, 'ordinary_language');
        assert.equal(attestation.session_record_count, 1);
        assert.equal(attestation.message_sha256, expectedMessageSha256);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(granted.status, 'authorized', JSON.stringify(granted));
        assert.equal(granted.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(granted.authorization_challenge, null);
        const stored = getForgeAuthorizationByRequest(value.db, pending.receipt_id)!;
        assert.equal(stored.operator_record_count, 1);
        assert.match(stored.operator_intent_json ?? '', /same_turn_request/);
        const replay = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(replay.authorization_replayed, true);
        assert.equal(replay.authorization_id, granted.authorization_id);
    });

    it('binds one exact receipt in the complete ordered root turn', async () => {
        const value = setupRoot('exact-request');
        const beadId = 'bead:test:natural-multi-record';
        const decisionId = 'decision:test:natural-multi-record-i1-repair';
        insertBead(value, beadId);
        const session = createSession({
            textParts: [`Build the repair for ${beadId}.`],
            timestamp: new Date(Date.now() - 3_000).toISOString(),
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(
            requestArgs(value, beadId, decisionId, session.threadId), context,
        ));
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            `Authorize and execute only ${pending.receipt_id} with request SHA-256 ${pending.request_sha256} for ${beadId} now.`,
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            'Keep the already bounded scope unchanged.',
            new Date(Date.parse(session.timestamp) + 2_000).toISOString(),
        );
        const attestation = await verifyCurrentForgeOperatorIntent(context, Date.now(), {
            request_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
            bead_id: beadId,
            decision_id: decisionId,
        });
        assert.equal(attestation.binding_mode, 'exact_request_receipt');
        assert.equal(attestation.session_record_count, 3);
        assert.equal(resolveForgeOperatorWorkItem(
            value.db, getForgeRequest(value.db, pending.receipt_id)!, attestation,
        ).requester_lineage_mode, 'explicit_request_receipt_binding');
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(granted.status, 'authorized', JSON.stringify(granted));
        assert.equal(getForgeAuthorizationByRequest(
            value.db, pending.receipt_id,
        )?.operator_record_count, 3);
    });

    it('binds one canonical mission to its sole pending iteration', async () => {
        const value = setupRoot('mission');
        const beadId = 'bead:test:natural-mission-record';
        const missionDecision = 'decision:test:natural-mission-record';
        insertBead(value, beadId);
        const session = createSession({
            textParts: ['Status is informational.'],
            timestamp: new Date(Date.now() - 2_000).toISOString(),
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const pending = parse(await handleForgeRequest(requestArgs(
            value, beadId, `${missionDecision}-i2-path-outcomes`, session.threadId,
        ), context));
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            `Continue and implement ${missionDecision} on ${beadId} now.`,
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id,
            request_sha256: pending.request_sha256,
        }, context));
        assert.equal(granted.status, 'authorized', JSON.stringify(granted));
        assert.match(getForgeAuthorizationByRequest(
            value.db, pending.receipt_id,
        )?.operator_intent_json ?? '', /explicit_mission_record_binding/);
    });

    it('requires one eligible pending mission child', async () => {
        const value = setupRoot('mission-ambiguous');
        const beadId = 'bead:test:natural-mission-ambiguous';
        const missionDecision = 'decision:test:natural-mission-ambiguous';
        insertBead(value, beadId);
        const session = createSession({
            textParts: ['Status is informational.'],
            timestamp: new Date(Date.now() - 2_000).toISOString(),
        });
        const context = validRequestContext(session.threadId, session.turnId);
        const requests = [];
        for (const suffix of ['i1-path', 'i2-outcomes']) {
            requests.push(parse(await handleForgeRequest(requestArgs(
                value, beadId, `${missionDecision}-${suffix}`, session.threadId,
            ), context)));
        }
        appendUserMessage(
            session.sessionFile,
            session.turnId,
            `Continue and implement ${missionDecision} on ${beadId} now.`,
            new Date(Date.parse(session.timestamp) + 1_000).toISOString(),
        );
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: requests[0]!.receipt_id,
            request_sha256: requests[0]!.request_sha256,
        }, context));
        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(value.db, requests[0]!.receipt_id), null);
        assert.equal(getForgeAuthorizationByRequest(value.db, requests[1]!.receipt_id), null);
    });

    for (const variant of [
        'duplicate-receipt',
        'mixed-receipt-mission',
        'scoped-revocation',
        'first-person-revocation',
        'receipt-suffix-collision',
    ] as const) {
        it(`rejects ${variant}`, async () => {
            const value = setupRoot(variant);
            const beadId = `bead:test:${variant}`;
            const missionDecision = `decision:test:${variant}`;
            insertBead(value, beadId);
            const session = createSession({
                textParts: ['Status is informational.'],
                timestamp: new Date(Date.now() - 3_000).toISOString(),
            });
            const context = validRequestContext(session.threadId, session.turnId);
            const pending = parse(await handleForgeRequest(requestArgs(
                value, beadId, `${missionDecision}-i1-repair`, session.threadId,
            ), context));
            const exact = `Authorize and execute only ${pending.receipt_id} with request SHA-256 ${pending.request_sha256} for ${beadId} now.`;
            const records = variant === 'duplicate-receipt'
                ? [exact, exact]
                : variant === 'mixed-receipt-mission'
                    ? [exact, `Continue and implement ${missionDecision} on ${beadId} now.`]
                    : variant === 'scoped-revocation'
                        ? [exact, `Do not implement ${beadId}.`]
                        : variant === 'first-person-revocation'
                            ? [exact, 'I am not authorizing this.']
                            : [`Authorize and execute only ${pending.receipt_id}x with request SHA-256 ${pending.request_sha256} for ${beadId} now.`];
            records.forEach((record, index) => appendUserMessage(
                session.sessionFile,
                session.turnId,
                record,
                new Date(Date.parse(session.timestamp) + (index + 1) * 1_000).toISOString(),
            ));
            const rejected = parse(await handleForgeAuthorize({
                forge_request_receipt_id: pending.receipt_id,
                request_sha256: pending.request_sha256,
            }, context));
            assert.equal(rejected.error_code, 'forge_operator_authorization_required');
            assert.equal(getForgeAuthorizationByRequest(value.db, pending.receipt_id), null);
        });
    }
});
