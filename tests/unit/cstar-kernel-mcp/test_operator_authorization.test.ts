import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    verifyCodexRequestIdentity,
    verifyOperatorAuthorization,
} from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    appendUserMessage,
    cleanupOperatorAuthorizationFixtures,
    createSession,
    CSTAR_TARGET,
    restoreEnv,
    TEST_BEAD_ID,
    TEST_DECISION_ID,
    TEST_PACKAGE_LOCK_SHA256,
    validRequestContext,
    validScope,
} from './operator_authorization_test_support.js';

afterEach(() => {
    cleanupOperatorAuthorizationFixtures();
});

describe('connection-bound Codex operator authorization', () => {
    it('accepts an omitted root thread_source while rejecting explicit nested lineage', async () => {
        const fixture = createSession({ sessionMeta: { thread_source: undefined } });

        const verified = await verifyCodexRequestIdentity(validRequestContext(
            fixture.threadId,
            fixture.turnId,
            { thread_source: undefined },
        ));

        assert.equal(verified.thread_id, fixture.threadId);
        assert.equal(verified.turn_id, fixture.turnId);
    });

    it('accepts one canonical multipart root-user turn', async () => {
        const fixture = createSession();
        fs.appendFileSync(fixture.sessionFile, `${JSON.stringify({ timestamp: fixture.timestamp, type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'I revoke Forge.' }], internal_chat_message_metadata_passthrough: { turn_id: fixture.turnId } } })}\n`);
        fs.appendFileSync(fixture.sessionFile, `${JSON.stringify({ timestamp: fixture.timestamp, type: 'event_msg', payload: { type: 'user_message', message: 'I revoke Forge.' } })}\n`);

        const verified = await verifyOperatorAuthorization(fixture.reference, validScope(fixture.threadId));

        assert.equal(verified.thread_id, fixture.threadId);
        assert.equal(verified.turn_id, fixture.turnId);
        assert.equal(verified.message_sha256, fixture.messageSha256);
        assert.equal(verified.authorization_profile, 'gpt56-cstar-exact-request-v3');
        assert.equal(verified.authorized_bead_id, TEST_BEAD_ID);
        assert.equal(verified.authorized_decision_id, TEST_DECISION_ID);
        assert.deepEqual(verified.authorized_package_lock_sha256s, [TEST_PACKAGE_LOCK_SHA256]);
        assert.equal(verified.synthetic_fixtures_only, true);
        assert.deepEqual(verified.authorized_paths, [CSTAR_TARGET]);
        assert.equal(verified.max_attempts, 1);
        assert.equal(verified.live_source_allowed, false);
        assert.ok(verified.expires_at > verified.authorized_at);
    });

    it('rejects wrong connection thread and non-direct transports', async () => {
        const fixture = createSession();

        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, {
                ...validScope(fixture.threadId),
                caller_thread_id: randomUUID(),
            }),
            /operator_authorization_thread_not_bound_to_connection/,
        );
        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, {
                ...validScope(fixture.threadId),
                caller_transport: 'tcp-daemon',
            }),
            /operator_authorization_requires_direct_stdio_connection/,
        );
    });

    it('rejects inherited subagent or fork session metadata', async () => {
        const fixture = createSession({
            sessionMeta: {
                thread_source: 'subagent',
                parent_thread_id: randomUUID(),
                agent_path: '/root/reviewer',
                forked_from_id: randomUUID(),
            },
        });

        await assert.rejects(
            verifyOperatorAuthorization(fixture.reference, validScope(fixture.threadId)),
            /operator_authorization_turn_is_not_from_canonical_user_thread/,
        );
    });

    it('rejects nested record lineage for current and historical authorization turns', async () => {
        const current = createSession({ userMetadata: { subagent_kind: 'reviewer' } });
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(current.threadId, current.turnId)),
            /codex_request_identity_turn_record_lineage_invalid/,
        );

        const historical = createSession({ userMetadata: { parent_thread_id: randomUUID() } });
        await assert.rejects(
            verifyOperatorAuthorization(historical.reference, validScope(historical.threadId)),
            /operator_authorization_later_user_record_uninspectable|codex_request_identity_turn_record_lineage_invalid/,
        );
    });

    it('rejects hash mismatch, duplicate turn, and malformed sessions', async () => {
        const mismatch = createSession();
        const badRef = mismatch.reference.replace(/[a-f0-9]{64}$/, '0'.repeat(64));
        await assert.rejects(
            verifyOperatorAuthorization(badRef, validScope(mismatch.threadId)),
            /operator_authorization_turn_match_count:0/,
        );

        const duplicate = createSession({ duplicate: true });
        await assert.rejects(
            verifyOperatorAuthorization(duplicate.reference, validScope(duplicate.threadId)),
            /operator_authorization_turn_match_count:2/,
        );

        const malformed = createSession({ malformedOnly: true });
        await assert.rejects(
            verifyOperatorAuthorization(malformed.reference, validScope(malformed.threadId)),
            /codex_request_identity_session_json_malformed/,
        );
    });

    it('rejects negated, quoted-example, and later-revoked consent', async () => {
        for (const text of [
            'Corvus CStar 5.6. I do not authorize you to complete the audit in full. Hermes M3.',
            'Corvus CStar 5.6. This is an example, not permission: I authorize you to complete the audit in full. Hermes M3.',
        ]) {
            const fixture = createSession({ textParts: [text] });
            await assert.rejects(
                verifyOperatorAuthorization(fixture.reference, validScope(fixture.threadId)),
                /operator_authorization_negated_or_revoked/,
            );
        }
        for (const text of [
            'Corvus CStar 5.6. I authorize you to complete the audit in full, but do not use Hermes or M3. Hermes M3.',
            'Corvus CStar 5.6. I authorize you to complete the audit in full, but do not execute Forge. Hermes M3.',
            'Corvus CStar 5.6. I authorize you to complete the audit in full, but authorize you not to use Hermes. M3.',
            'Corvus CStar 5.6. I authorize you to complete the audit in full. No Hermes/M3.',
            'Corvus CStar 5.6. I authorize you to complete the audit in full. No Forge execution. Hermes M3.',
            'Corvus CStar 5.6. I authorize you to complete the audit in full, but not via Hermes. Hermes M3.',
        ]) {
            const fixture = createSession({ textParts: [text] });
            await assert.rejects(
                verifyOperatorAuthorization(fixture.reference, validScope(fixture.threadId)),
                /operator_authorization_contradictory_forge_lane_instruction/,
            );
        }
        const revoked = createSession({ laterUserText: 'I revoke the Forge audit authorization.' });
        await assert.rejects(
            verifyOperatorAuthorization(revoked.reference, validScope(revoked.threadId)),
            /operator_authorization_later_revocation_found/,
        );
        const withdrawn = createSession({ laterUserText: 'I do not authorize further Forge execution.' });
        await assert.rejects(
            verifyOperatorAuthorization(withdrawn.reference, validScope(withdrawn.threadId)),
            /operator_authorization_later_revocation_found/,
        );
        for (const payload of [
            { type: 'message', role: 'user', content: [{ type: 'output_text', text: 'I revoke Forge.' }] },
            { type: 'user_message', role: 'user', message: 'I revoke Forge.' },
        ]) {
            const uninspectable = createSession();
            fs.appendFileSync(uninspectable.sessionFile, `${JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { ...payload, internal_chat_message_metadata_passthrough: { turn_id: randomUUID() } } })}\n`);
            await assert.rejects(verifyOperatorAuthorization(uninspectable.reference, validScope(uninspectable.threadId)), /operator_authorization_later_user_record_uninspectable/);
        }
    });

    it('rejects expired grants, empty targets, and Corvus spoke targets', async () => {
        const expired = createSession({ timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
        await assert.rejects(
            verifyOperatorAuthorization(expired.reference, validScope(expired.threadId)),
            /operator_authorization_expired_or_future_dated/,
        );

        const empty = createSession();
        await assert.rejects(
            verifyOperatorAuthorization(empty.reference, {
                ...validScope(empty.threadId),
                target_paths: [],
            }),
            /operator_authorization_requires_nonempty_targets/,
        );

        const spoke = createSession();
        await assert.rejects(
            verifyOperatorAuthorization(spoke.reference, {
                ...validScope(spoke.threadId),
                target_paths: ['/home/morderith/Corvus/ENM'],
            }),
            /operator_authorization_target_out_of_scope/,
        );
    });

    it('rejects a pathless grant and any target not stated by the operator', async () => {
        const pathless = createSession({
            textParts: [
                `Corvus CStar 5.6. I authorize you to complete the audit in full through Hermes M3 for ${TEST_BEAD_ID} and ${TEST_DECISION_ID}, with zero retries, synthetic fixtures only, no live source collection, package-lock SHA-256 ${TEST_PACKAGE_LOCK_SHA256}.`,
            ],
        });
        await assert.rejects(
            verifyOperatorAuthorization(pathless.reference, validScope(pathless.threadId)),
            /operator_authorization_explicit_target_manifest_missing/,
        );

        const differentTarget = createSession();
        await assert.rejects(
            verifyOperatorAuthorization(differentTarget.reference, {
                ...validScope(differentTarget.threadId),
                target_paths: [CSTAR_TARGET.replace(/AGENTS\.md$/, 'package.json')],
            }),
            /operator_authorization_target_manifest_mismatch/,
        );
    });

    it('rejects symlink and hardlink session substitution', async () => {
        const symlink = createSession();
        const original = `${symlink.sessionFile}.original`;
        fs.renameSync(symlink.sessionFile, original);
        fs.symlinkSync(original, symlink.sessionFile);
        await assert.rejects(
            verifyOperatorAuthorization(symlink.reference, validScope(symlink.threadId)),
            /operator_authorization_session_match_count:0/,
        );

        const hardlink = createSession();
        fs.linkSync(hardlink.sessionFile, `${hardlink.sessionFile}.copy`);
        await assert.rejects(
            verifyOperatorAuthorization(hardlink.reference, validScope(hardlink.threadId)),
            /operator_authorization_session_file_is_unsafe/,
        );
    });
});

describe('Codex MCP request identity', () => {
    it('accepts host metadata bound to a canonical root-user session and turn', async () => {
        const fixture = createSession({ repeatCanonicalSessionMeta: true });

        const verified = await verifyCodexRequestIdentity(
            validRequestContext(fixture.threadId, fixture.turnId),
        );

        assert.equal(verified.thread_id, fixture.threadId);
        assert.equal(verified.turn_id, fixture.turnId);
        assert.equal(verified.session_id, fixture.threadId);
        assert.equal(verified.source, 'codex_request_meta');
        assert.match(verified.turn_record_sha256, /^[a-f0-9]{64}$/);
        assert.equal(verified.turn_record_count, 1);
    });

    it('binds distinct steering messages sharing one turn to an ordered record-set hash', async () => {
        const fixture = createSession();
        appendUserMessage(
            fixture.sessionFile, fixture.turnId, 'first legitimate steering message',
            new Date(Date.parse(fixture.timestamp) + 1_000).toISOString(),
        );
        appendUserMessage(
            fixture.sessionFile, fixture.turnId, 'second legitimate steering message',
            new Date(Date.parse(fixture.timestamp) + 2_000).toISOString(),
        );

        const first = await verifyCodexRequestIdentity(
            validRequestContext(fixture.threadId, fixture.turnId),
        );
        const replay = await verifyCodexRequestIdentity(
            validRequestContext(fixture.threadId, fixture.turnId),
        );

        assert.equal(first.turn_record_count, 3);
        assert.equal(first.turn_record_sha256, replay.turn_record_sha256);
        assert.equal(first.turn_timestamp, new Date(Date.parse(fixture.timestamp) + 2_000).toISOString());
        assert.match(first.turn_record_sha256, /^[a-f0-9]{64}$/);
        const authorization = await verifyOperatorAuthorization(
            fixture.reference,
            { ...validScope(fixture.threadId), request_context: validRequestContext(fixture.threadId, fixture.turnId) },
        );
        assert.equal(authorization.message_sha256, fixture.messageSha256);
        assert.equal(authorization.session_record_count, 3);
        assert.equal(authorization.session_record_set_sha256, first.turn_record_set_sha256);
    });

    it('lets Forge bind an authorization through verified host request metadata', async () => {
        const fixture = createSession();
        const previous = process.env.CSTAR_MCP_CALLER_THREAD_ID;
        delete process.env.CSTAR_MCP_CALLER_THREAD_ID;
        try {
            const verified = await verifyOperatorAuthorization(fixture.reference, {
                ...validScope(fixture.threadId),
                request_context: validRequestContext(fixture.threadId, fixture.turnId),
            });
            assert.equal(verified.thread_id, fixture.threadId);
        } finally {
            restoreEnv('CSTAR_MCP_CALLER_THREAD_ID', previous);
        }
    });

    it('keeps a prior authorization independent from a later canonical request turn', async () => {
        const fixture = createSession();
        const requestTurnId = randomUUID();
        appendUserMessage(
            fixture.sessionFile,
            requestTurnId,
            'Repair Forge using the authorization already given.',
            new Date(Date.parse(fixture.timestamp) + 1_000).toISOString(),
        );
        const verified = await verifyOperatorAuthorization(
            fixture.reference,
            { ...validScope(fixture.threadId), request_context: validRequestContext(fixture.threadId, requestTurnId) },
        );
        assert.equal(verified.turn_id, fixture.turnId);
        assert.equal(verified.session_record_count, 1);
    });

    it('rejects missing metadata, mismatched ids, and subagent lineage', async () => {
        const fixture = createSession();
        await assert.rejects(
            verifyCodexRequestIdentity(undefined),
            /codex_request_identity_metadata_required/,
        );
        await assert.rejects(
            verifyCodexRequestIdentity({
                _meta: {
                    ...validRequestContext(fixture.threadId, fixture.turnId)._meta,
                    threadId: randomUUID(),
                },
            }),
            /codex_request_identity_thread_mismatch/,
        );
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(fixture.threadId, fixture.turnId, {
                thread_source: 'subagent',
                parent_thread_id: randomUUID(),
                subagent_kind: 'reviewer',
            })),
            /codex_request_identity_requires_root_user_thread|codex_request_identity_rejects_parent_fork_or_subagent/,
        );
    });

    it('rejects duplicate records, noncanonical sessions, and stale turns', async () => {
        const duplicate = createSession({ duplicate: true });
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(duplicate.threadId, duplicate.turnId)),
            /codex_request_identity_duplicate_turn_record/,
        );

        const noncanonical = createSession({
            sessionMeta: {
                thread_source: 'subagent',
                parent_thread_id: randomUUID(),
                agent_path: '/root/reviewer',
            },
        });
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(noncanonical.threadId, noncanonical.turnId)),
            /codex_request_identity_session_is_not_canonical_root_user/,
        );

        const stale = createSession({ timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(stale.threadId, stale.turnId)),
            /codex_request_identity_turn_expired_or_future_dated/,
        );
    });

    it('rejects noncontiguous, nonmonotonic, and incomplete steering record sets', async () => {
        const noncontiguous = createSession();
        appendUserMessage(
            noncontiguous.sessionFile, randomUUID(), 'different turn',
            new Date(Date.parse(noncontiguous.timestamp) + 1_000).toISOString(),
        );
        appendUserMessage(
            noncontiguous.sessionFile, noncontiguous.turnId, 'old turn reused',
            new Date(Date.parse(noncontiguous.timestamp) + 2_000).toISOString(),
        );
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(noncontiguous.threadId, noncontiguous.turnId)),
            /codex_request_identity_turn_records_noncontiguous/,
        );

        const nonmonotonic = createSession();
        appendUserMessage(
            nonmonotonic.sessionFile, nonmonotonic.turnId, 'timestamp went backwards',
            new Date(Date.parse(nonmonotonic.timestamp) - 1_000).toISOString(),
        );
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(nonmonotonic.threadId, nonmonotonic.turnId)),
            /codex_request_identity_turn_timestamps_nonmonotonic/,
        );

        const incomplete = createSession();
        fs.appendFileSync(incomplete.sessionFile, `${JSON.stringify({
            timestamp: new Date(Date.parse(incomplete.timestamp) + 1_000).toISOString(),
            type: 'response_item',
            payload: {
                type: 'message', role: 'user', content: [],
                internal_chat_message_metadata_passthrough: { turn_id: incomplete.turnId },
            },
        })}\n`);
        await assert.rejects(
            verifyCodexRequestIdentity(validRequestContext(incomplete.threadId, incomplete.turnId)),
            /codex_request_identity_turn_is_incomplete/,
        );
    });
});
