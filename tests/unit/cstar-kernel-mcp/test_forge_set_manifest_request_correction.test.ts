import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { handleForgeAuthorize } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { saveForgeRequest } from
    '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import {
    getForgeRequest,
    getForgeRequestByDecision,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    parse,
} from './forge_natural_authorization_test_support.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    buildCorrectionInput,
    CORRECTION_MISSION,
    CORRECTION_SECOND,
    prepareForgeSetCorrection,
} from './forge_set_manifest_correction_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('SET iteration preauthorization request correction', () => {
    it('preserves immutable requester lineage after same-turn record growth', async () => {
        const fixture = await prepareForgeSetCorrection('record-growth');
        const old = fixture.oldRequest;
        appendUserMessage(
            fixture.session.sessionFile,
            old.requester_turn_id!,
            'Informational attachment added after the pending request.',
            new Date(Date.parse(fixture.session.timestamp) + 25_000).toISOString(),
        );
        const expandedIdentity = await verifyCodexRequestIdentity(fixture.laterContext);
        assert.equal(expandedIdentity.thread_id, old.requester_thread_id);
        assert.equal(expandedIdentity.turn_id, old.requester_turn_id);
        assert.notEqual(
            expandedIdentity.turn_record_set_sha256,
            old.requester_record_set_sha256,
        );

        const corrected = parse(await handleForgeRequest(
            fixture.correctedArgs, fixture.laterContext,
        ));
        assert.equal(
            corrected.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
        const replacement = getForgeRequestByDecision(
            fixture.value.db, CORRECTION_SECOND, `${CORRECTION_MISSION}:batch-2`,
        )!;
        for (const field of [
            'requester_thread_id', 'requester_turn_id', 'requester_record_set_sha256',
            'authorization_profile', 'authorization_binding_sha256',
            'authorization_challenge_sha256', 'operator_authorization_ref',
            'operator_thread_id', 'operator_turn_id', 'operator_message_sha256',
            'operator_record_sha256', 'operator_record_set_sha256',
            'operator_record_count', 'adapter_ref', 'write_capability',
            'live_source_allowed', 'max_attempts',
        ] as const) {
            assert.equal(replacement[field], old[field], field);
        }
        assert.notEqual(
            replacement.requester_record_set_sha256,
            expandedIdentity.turn_record_set_sha256,
        );
        const replay = parse(await handleForgeRequest(
            fixture.correctedArgs, fixture.laterContext,
        ));
        assert.equal(
            replay.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
        assert.equal(
            getForgeRequest(fixture.value.db, replacement.request_id)!
                .requester_record_set_sha256,
            old.requester_record_set_sha256,
        );
        const authorized = parse(await handleForgeAuthorize({
            forge_request_receipt_id: replacement.request_id,
            request_sha256: replacement.request_sha256,
        }, fixture.laterContext));
        assert.equal(
            authorized.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
    });

    it('does not supersede the omitted-target receipt after ambiguous spend', async () => {
        const fixture = await prepareForgeSetCorrection('exact-reproduction');
        const oldHash = fixture.oldRequest.request_sha256;
        const oldSummary = fixture.oldRequest.request_summary_json;
        const corrected = parse(await handleForgeRequest(
            fixture.correctedArgs, fixture.laterContext,
        ));
        assert.equal(
            corrected.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );

        const old = getForgeRequest(fixture.value.db, fixture.oldRequest.request_id)!;
        const active = getForgeRequestByDecision(
            fixture.value.db, CORRECTION_SECOND, `${CORRECTION_MISSION}:batch-2`,
        )!;
        assert.equal(old.status, 'PENDING_AUTH');
        assert.equal(old.request_sha256, oldHash);
        assert.equal(old.request_summary_json, oldSummary);
        assert.equal(active.request_id, old.request_id);
        assert.equal(old.superseded_by, undefined);
        assert.equal(active.supersedes_request_id, undefined);

        const replay = parse(await handleForgeRequest(
            fixture.correctedArgs, fixture.laterContext,
        ));
        assert.equal(
            replay.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
        const staleReplay = parse(await handleForgeRequest(
            fixture.omittedArgs, fixture.laterContext,
        ));
        assert.equal(
            staleReplay.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
        const authorized = parse(await handleForgeAuthorize({
            forge_request_receipt_id: active.request_id,
            request_sha256: active.request_sha256,
        }, fixture.laterContext));
        assert.equal(
            authorized.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
    });

    it('rejects every authority-bearing correction drift at the controller', async () => {
        const fixture = await prepareForgeSetCorrection('authority-drift');
        const corrected = parse(await handleForgeRequest(
            fixture.correctedArgs, fixture.laterContext,
        ));
        assert.equal(
            corrected.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
        const mutations: Array<[string, (value: any) => void]> = [
            ['target', (v) => { v.target_paths.push(`${v.target_paths[0]}.extra`); }],
            ['output', (v) => { v.required_output_paths.push(v.target_paths[0]); }],
            ['action', (v) => { v.requested_actions = ['validation_artifacts']; }],
            ['spend', (v) => { v.spend_policy.max_retries = 1; }],
            ['live source', (v) => { v.spend_policy.live_source_allowed = true; }],
            ['retry', (v) => { v.retry_budget = 1; }],
            ['source', (v) => { v.live_source_policy = 'collect live sources'; }],
            ['package lock', (v) => {
                v.package_locks.push({ path: '/synthetic/lock', sha256: '1'.repeat(64) });
            }],
            ['prompt', (v) => { v.prompt += ' changed'; }],
            ['objective', (v) => { v.objective += ' changed'; }],
            ['callback', (v) => { v.callback_contract.expected_packet += '_CHANGED'; }],
            ['scope', (v) => { v.scope += ' expanded'; }],
            ['adapter', (v) => { v.adapter_ref = 'different-adapter'; }],
            ['write capability', (v) => { v.write_capability = 'project_files'; }],
        ];
        for (const [label, mutate] of mutations) {
            assert.throws(
                () => saveForgeRequest(fixture.value.db, buildCorrectionInput(fixture, mutate)),
                /forge_(set_manifest_(iteration_constraints_widened|request_policy_invalid|iteration_predecessor_not_authoritative)|request_preauthorization_correction_not_allowed)/,
                label,
            );
        }
    });

    it('does not refresh runtime evidence after ambiguous spend', async () => {
        const fixture = await prepareForgeSetCorrection('runtime-refresh');
        const oldCanonical = JSON.parse(fixture.oldRequest.request_summary_json);
        fs.appendFileSync(
            oldCanonical.adapter_runtime.path,
            '\n# synthetic validated runtime refresh\n',
        );
        const corrected = parse(await handleForgeRequest(
            fixture.correctedArgs, fixture.laterContext,
        ));
        assert.equal(
            corrected.error_code,
            'forge_set_manifest_iteration_predecessor_not_authoritative',
        );
        const active = getForgeRequestByDecision(
            fixture.value.db, CORRECTION_SECOND, `${CORRECTION_MISSION}:batch-2`,
        )!;
        const refreshed = JSON.parse(active.request_summary_json);
        assert.equal(
            refreshed.adapter_runtime.sha256,
            oldCanonical.adapter_runtime.sha256,
        );
        assert.equal(refreshed.adapter_ref, oldCanonical.adapter_ref);
        assert.equal(refreshed.write_capability, oldCanonical.write_capability);
    });

    it('rejects runtime snapshot drift without request-creation validation', async () => {
        const fixture = await prepareForgeSetCorrection('runtime-attestation');
        assert.equal((parse(await handleForgeRequest(
            fixture.correctedArgs, fixture.laterContext,
        ))).error_code, 'forge_set_manifest_iteration_predecessor_not_authoritative');
        assert.throws(
            () => saveForgeRequest(fixture.value.db, buildCorrectionInput(fixture, (value) => {
                value.adapter_runtime.sha256 = '1'.repeat(64);
            })),
            /forge_request_preauthorization_correction_not_allowed/,
        );
    });

    it('rejects a corrected resubmission from another root requester', async () => {
        const fixture = await prepareForgeSetCorrection('root-mismatch');
        const other = createSession({ textParts: ['Continue this correction.'] });
        const result = parse(await handleForgeRequest(
            fixture.correctedArgs,
            validRequestContext(other.threadId, other.turnId),
        ));
        assert.match(result.error, /forge_request_preauthorization_correction_not_allowed/);
    });

    for (const [label, mutate] of [
        ['non-pending status', (db: any, requestId: string) => db.prepare(
            "UPDATE hall_forge_requests SET status = 'AUTHORIZED' WHERE request_id = ?",
        ).run(requestId)],
        ['operator binding', (db: any, requestId: string) => db.prepare(`
            UPDATE hall_forge_requests SET operator_authorization_ref = ?
            WHERE request_id = ?
        `).run(`operator:${randomUUID()}`, requestId)],
        ['active attempt', (db: any, requestId: string) => db.prepare(`
            UPDATE hall_forge_requests SET active_attempt_id = ? WHERE request_id = ?
        `).run(`attempt:${randomUUID()}`, requestId)],
        ['non-root authorization profile', (db: any, requestId: string) => db.prepare(`
            UPDATE hall_forge_requests
            SET authorization_profile = 'exact_request_challenge_v1'
            WHERE request_id = ?
        `).run(requestId)],
        ['attempt row', (db: any, requestId: string) => db.prepare(`
            INSERT INTO hall_forge_attempts (
                attempt_id, request_id, ordinal, idempotency_key,
                execution_receipt_id, adapter_ref, status, reserved_at, updated_at
            ) VALUES (?, ?, 1, ?, ?, ?, 'RESERVED', ?, ?)
        `).run(
            `attempt-${randomUUID()}`, requestId, randomUUID(), randomUUID(),
            'cstar-forge-hermes-minimax-worker-adapter', Date.now(), Date.now(),
        )],
        ['authorization row', (db: any, requestId: string) => {
            const request = getForgeRequest(db, requestId)!;
            db.prepare(`
                INSERT INTO hall_forge_authorizations (
                    authorization_id, request_id, request_sha256, authorization_profile,
                    authorization_binding_sha256, operator_intent_json,
                    operator_authorization_ref, operator_thread_id, operator_turn_id,
                    operator_message_sha256, operator_record_sha256,
                    operator_record_set_sha256, operator_record_count,
                    authorized_at, expires_at, created_at
                ) VALUES (?, ?, ?, 'root_user_forge_intent_v1', ?, '{}',
                          ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            `).run(
                `authorization-${randomUUID()}`, requestId, request.request_sha256,
                '1'.repeat(64), `operator:${randomUUID()}`, randomUUID(), randomUUID(),
                '2'.repeat(64), '3'.repeat(64), '4'.repeat(64),
                Date.now(), Date.now() + 60_000, Date.now(),
            );
        }],
    ] as Array<[string, (db: any, requestId: string) => void]>) {
        it(`rejects correction with ${label}`, async () => {
            const fixture = await prepareForgeSetCorrection(label.replaceAll(' ', '-'));
            mutate(fixture.value.db, fixture.oldRequest.request_id);
            const result = parse(await handleForgeRequest(
                fixture.correctedArgs, fixture.laterContext,
            ));
            assert.match(result.error, /forge_request_preauthorization_correction_not_allowed/);
            assert.equal(getForgeRequest(
                fixture.value.db, fixture.oldRequest.request_id,
            )?.status === 'SUPERSEDED', false);
        });
    }
});
