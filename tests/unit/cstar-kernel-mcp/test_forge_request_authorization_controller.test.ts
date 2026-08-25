import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import Database from 'better-sqlite3';

import {
    exactForgeAuthorizationMatchesRequest,
    getForgeAuthorizationByRequest,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    authorizeForgeRequest,
    saveForgeRequest,
    type SaveForgeRequestInput,
} from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { ensureHallSchema } from '../../../src/tools/pennyone/intel/schema.js';
import {
    buildForgeOperatorIntentProjection,
    forgeOperatorIntentProjectionJson,
    hashRootUserForgeIntentBinding,
} from '../../../src/tools/pennyone/intel/forge_authorization_policy.js';
import {
    buildForgeGoalResumeAuthorizationProjection,
    forgeGoalResumeAuthorizationProjectionJson,
    hashForgeGoalResumeAuthorizationBinding,
} from '../../../src/tools/pennyone/intel/forge_goal_resume_authorization_policy.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeAuthorizationInput,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveLegacyAuthorizedForgeRequest,
    trackForgeReceiptRoot,
} from './forge_receipt_test_support.js';
import { HALL_SCHEMA_CORE_SQL } from
    '../../../src/tools/pennyone/intel/schema_tables_core.js';

afterEach(cleanupForgeReceiptFixtures);

describe('durable exact Forge request authorization', () => {
    it('migrates an old Forge request table without changing its canonical row', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-forge-old-schema-'));
        trackForgeReceiptRoot(root);
        const db = new Database(path.join(root, 'hall.db'));
        db.exec(`
            CREATE TABLE hall_forge_requests (
                request_id TEXT PRIMARY KEY, repo_id TEXT NOT NULL,
                bead_id TEXT NOT NULL, decision_id TEXT NOT NULL,
                operator_authorization_ref TEXT, operator_thread_id TEXT,
                operator_turn_id TEXT, operator_message_sha256 TEXT,
                operator_record_sha256 TEXT, operator_record_set_sha256 TEXT,
                operator_record_count INTEGER, request_sha256 TEXT NOT NULL,
                request_summary_json TEXT NOT NULL, adapter_ref TEXT,
                write_capability TEXT, target_paths_sha256 TEXT NOT NULL,
                live_source_allowed INTEGER NOT NULL, max_attempts INTEGER NOT NULL,
                status TEXT NOT NULL, active_attempt_id TEXT, authorized_at INTEGER,
                expires_at INTEGER, created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL, completed_at INTEGER,
                UNIQUE(bead_id, decision_id), UNIQUE(operator_authorization_ref)
            );
        `);
        const now = Date.now();
        db.prepare(`
            INSERT INTO hall_forge_requests (
                request_id, repo_id, bead_id, decision_id, request_sha256,
                request_summary_json, target_paths_sha256, live_source_allowed,
                max_attempts, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 'PENDING_AUTH', ?, ?)
        `).run(
            'dispatch-forge-11111111111111111111111111111111',
            'legacy-repo', 'bead:legacy', 'decision:legacy',
            'a'.repeat(64), '{"legacy":true}', 'b'.repeat(64), now, now,
        );
        db.exec(HALL_SCHEMA_CORE_SQL);
        db.prepare(`
            INSERT INTO hall_repositories (
                repo_id, root_path, name, created_at, updated_at
            ) VALUES ('legacy-repo', '/legacy', 'legacy', ?, ?)
        `).run(now, now);
        db.prepare(`
            INSERT INTO hall_beads (
                bead_id, repo_id, rationale, created_at, updated_at
            ) VALUES ('bead:legacy', 'legacy-repo', 'legacy fixture', ?, ?)
        `).run(now, now);

        ensureHallSchema(db, root);

        const columns = new Set((db.prepare('PRAGMA table_info(hall_forge_requests)').all() as Array<{ name: string }>)
            .map((column) => column.name));
        for (const expected of [
            'requester_thread_id', 'requester_turn_id', 'requester_record_set_sha256',
            'authorization_profile', 'authorization_challenge_sha256',
        ]) assert.equal(columns.has(expected), true, expected);
        assert.ok(db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'hall_forge_authorizations'
        `).get());
        const preserved = db.prepare(`
            SELECT request_sha256, request_summary_json, target_paths_sha256, status
            FROM hall_forge_requests WHERE request_id = ?
        `).get('dispatch-forge-11111111111111111111111111111111') as Record<string, unknown>;
        assert.deepEqual(preserved, {
            request_sha256: 'a'.repeat(64),
            request_summary_json: '{"legacy":true}',
            target_paths_sha256: 'b'.repeat(64),
            status: 'PENDING_AUTH',
        });
        db.close();
    });

    it('persists pending requests before authorization', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:pending';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const input = forgeRequestInput(fixture.repoId, beadId, {
            adapter_ref: undefined,
            write_capability: undefined,
            authorization_profile: undefined,
            authorization_challenge_sha256: undefined,
        });

        const saved = saveForgeRequest(fixture.db, input);

        assert.equal(saved.replayed, false);
        assert.equal(saved.request.status, 'PENDING_AUTH');
        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                request_id: input.request_id,
                authorization_id: 'forge-auth-missing',
                idempotency_key: 'pending-attempt',
                execution_receipt_id: 'pending-receipt',
                adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            }),
            /forge_request_not_authorized:PENDING_AUTH/,
        );
        fixture.db.close();
    });

    it('requires immutable requester lineage for a fresh natural-profile request', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:natural-lineage-required';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const input = forgeRequestInput(fixture.repoId, beadId, {
            authorization_profile: 'root_user_forge_intent_v1',
            authorization_challenge_sha256: undefined,
            requester_thread_id: undefined,
            requester_turn_id: undefined,
            requester_record_set_sha256: undefined,
        });
        assert.throws(
            () => saveForgeRequest(fixture.db, input),
            /forge_request_natural_authorization_requester_lineage_required/,
        );
        fixture.db.close();
    });

    it('keeps an exact-profile request unchanged until natural intent is attested', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:exact-replay-stays-exact';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const exact = forgeRequestInput(fixture.repoId, beadId);
        saveForgeRequest(fixture.db, exact);
        const replay = saveForgeRequest(fixture.db, {
            ...exact,
            requester_thread_id: randomUUID(),
            requester_turn_id: randomUUID(),
            requester_record_set_sha256: '9'.repeat(64),
            authorization_profile: 'root_user_forge_intent_v1',
            authorization_challenge_sha256: undefined,
        });
        assert.equal(replay.request.authorization_profile, 'exact_request_challenge_v1');
        assert.equal(replay.request.authorization_challenge_sha256, 'f'.repeat(64));
        assert.equal(replay.challenge_upgraded, false);
        fixture.db.close();
    });

    it('rejects a natural projection that names a different request bead', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:natural-selected';
        const otherBeadId = 'bead:test:natural-other';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        insertForgeReceiptBead(fixture.db, fixture.repoId, otherBeadId);
        const request = forgeRequestInput(fixture.repoId, beadId, {
            authorization_profile: 'root_user_forge_intent_v1',
            authorization_challenge_sha256: undefined,
        });
        const saved = saveForgeRequest(fixture.db, request).request;
        const projection = buildForgeOperatorIntentProjection({
            action: 'build',
            requester_lineage_mode: 'same_turn_request',
            kind: 'bead',
            value: otherBeadId,
            repo_id: fixture.repoId,
        });
        const operator = {
            thread: request.requester_thread_id!,
            turn: request.requester_turn_id!,
            recordSet: request.requester_record_set_sha256!,
            message: '1'.repeat(64),
            record: '2'.repeat(64),
        };
        const binding = hashRootUserForgeIntentBinding({
            request: saved,
            projection,
            operator_thread_id: operator.thread,
            operator_turn_id: operator.turn,
            operator_message_sha256: operator.message,
            operator_record_sha256: operator.record,
            operator_record_set_sha256: operator.recordSet,
            operator_record_count: 1,
        });
        assert.throws(
            () => authorizeForgeRequest(fixture.db, forgeAuthorizationInput(request, {
                authorization_profile: 'root_user_forge_intent_v1',
                authorization_binding_sha256: binding,
                challenge_sha256: undefined,
                operator_intent_json: forgeOperatorIntentProjectionJson(projection),
                operator_thread_id: operator.thread,
                operator_turn_id: operator.turn,
                operator_message_sha256: operator.message,
                operator_record_sha256: operator.record,
                operator_record_set_sha256: operator.recordSet,
            })),
            /forge_operator_intent_selected_request_mismatch/,
        );
        fixture.db.close();
    });

    it('persists every exact attestation field and rejects replay drift', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:authorization-record-set';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const input = forgeRequestInput(fixture.repoId, beadId);
        const saved = saveForgeRequest(fixture.db, input);
        const authorization = forgeAuthorizationInput(input);
        const authorized = authorizeForgeRequest(fixture.db, authorization);

        assert.equal(saved.request.status, 'PENDING_AUTH');
        assert.equal(authorized.request.operator_record_sha256, authorization.operator_record_sha256);
        assert.equal(authorized.request.operator_record_set_sha256, authorization.operator_record_set_sha256);
        assert.equal(authorized.request.operator_record_count, 1);
        assert.equal(exactForgeAuthorizationMatchesRequest(
            authorized.request,
            authorized.authorization,
        ), true);
        assert.equal(saveForgeRequest(fixture.db, input).replayed, true);
        assert.equal(authorizeForgeRequest(fixture.db, authorization).replayed, true);
        assert.throws(
            () => authorizeForgeRequest(fixture.db, {
                ...authorization,
                operator_record_set_sha256: 'f'.repeat(64),
            }),
            /forge_request_authorization_conflict/,
        );
        assert.throws(
            () => authorizeForgeRequest(fixture.db, {
                ...authorization,
                operator_record_count: 2,
            }),
            /forge_authorization_attestation_invalid/,
        );
        fixture.db.close();
    });

    it('accepts a complete multi-record identity only for the goal-resume projection', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:goal-resume-multi-record';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const requestInput = forgeRequestInput(fixture.repoId, beadId);
        const request = saveForgeRequest(fixture.db, requestInput).request;
        const operator = {
            thread: randomUUID(),
            turn: randomUUID(),
            message: '1'.repeat(64),
            record: '2'.repeat(64),
            recordSet: '3'.repeat(64),
            count: 2,
        };
        const projection = buildForgeGoalResumeAuthorizationProjection({
            request,
            historical: {
                scope_authority: 'historical_exact_challenge',
                reference: 'cstar-forge-challenge:synthetic-history',
                thread_id: randomUUID(),
                turn_id: randomUUID(),
                message_sha256: '4'.repeat(64),
                session_record_sha256: '5'.repeat(64),
                session_record_set_sha256: '6'.repeat(64),
                session_record_count: 1,
                authorized_at: Date.now() - 1_000,
            },
            goal_resume_id: `goal-resume:${'7'.repeat(64)}`,
            event_sha256: '8'.repeat(64),
            operator_attestation_sha256: '9'.repeat(64),
            current_thread_id: operator.thread,
            current_turn_id: operator.turn,
            current_record_set_sha256: operator.recordSet,
            challenge_sha256: request.authorization_challenge_sha256!,
        });
        const binding = hashForgeGoalResumeAuthorizationBinding({
            request,
            projection,
            operator_thread_id: operator.thread,
            operator_turn_id: operator.turn,
            operator_message_sha256: operator.message,
            operator_record_sha256: operator.record,
            operator_record_set_sha256: operator.recordSet,
            operator_record_count: operator.count,
        });

        const authorized = authorizeForgeRequest(fixture.db, forgeAuthorizationInput(
            requestInput,
            {
                authorization_profile: 'root_user_forge_intent_v1',
                authorization_binding_sha256: binding,
                challenge_sha256: undefined,
                operator_intent_json: forgeGoalResumeAuthorizationProjectionJson(projection),
                operator_thread_id: operator.thread,
                operator_turn_id: operator.turn,
                operator_message_sha256: operator.message,
                operator_record_sha256: operator.record,
                operator_record_set_sha256: operator.recordSet,
                operator_record_count: operator.count,
            },
        ));

        assert.equal(authorized.request.operator_record_count, 2);
        assert.equal(authorized.authorization.operator_record_count, 2);
        fixture.db.close();
    });

    it('does not let a wrong authorization id replay an existing attempt', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:attempt-replay-authorization';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const request = forgeRequestInput(fixture.repoId, beadId);
        saveForgeRequest(fixture.db, request);
        const authorized = authorizeForgeRequest(fixture.db, forgeAuthorizationInput(request));
        const reserve = {
            request_id: request.request_id,
            authorization_id: authorized.authorization.authorization_id,
            idempotency_key: 'immutable-replay-key',
            execution_receipt_id: 'immutable-replay-receipt',
            adapter_ref: request.adapter_ref!,
        };
        reserveForgeAttempt(fixture.db, reserve);
        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                ...reserve,
                authorization_id: 'forge-auth-wrong',
            }),
            /forge_exact_authorization_receipt_required/,
        );
        fixture.db.close();
    });

    it('makes an exact authorizing turn one-shot', () => {
        const fixture = createForgeReceiptFixture();
        insertForgeReceiptBead(fixture.db, fixture.repoId, 'bead:test:one');
        insertForgeReceiptBead(fixture.db, fixture.repoId, 'bead:test:two');
        const first = forgeRequestInput(fixture.repoId, 'bead:test:one');
        const second = forgeRequestInput(fixture.repoId, 'bead:test:two');
        saveForgeRequest(fixture.db, first);
        saveForgeRequest(fixture.db, second);
        const firstAuthorization = forgeAuthorizationInput(first);
        authorizeForgeRequest(fixture.db, firstAuthorization);

        assert.throws(
            () => authorizeForgeRequest(fixture.db, forgeAuthorizationInput(second, {
                operator_thread_id: firstAuthorization.operator_thread_id,
                operator_turn_id: firstAuthorization.operator_turn_id,
            })),
            /forge_operator_turn_already_consumed/,
        );
        fixture.db.close();
    });

    it('blocks a legacy authorized row without an immutable exact receipt', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:legacy-no-exact-receipt';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const request = forgeRequestInput(fixture.repoId, beadId, {
            authorization_profile: undefined,
            authorization_challenge_sha256: undefined,
        });
        saveLegacyAuthorizedForgeRequest(fixture.db, request);

        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                request_id: request.request_id,
                authorization_id: 'forge-auth-missing',
                idempotency_key: 'legacy-must-not-reserve',
                execution_receipt_id: 'legacy-must-not-reserve',
                adapter_ref: request.adapter_ref!,
            }),
            /forge_exact_authorization_receipt_required/,
        );
        assert.equal(getForgeAuthorizationByRequest(fixture.db, request.request_id), null);
        fixture.db.close();
    });

    it('moves an unspent legacy row back to pending before exact authorization', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:legacy-upgrade';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const legacy = forgeRequestInput(fixture.repoId, beadId, {
            authorization_profile: undefined,
            authorization_challenge_sha256: undefined,
        });
        saveLegacyAuthorizedForgeRequest(fixture.db, legacy);
        const upgradedInput: SaveForgeRequestInput = {
            ...legacy,
            authorization_profile: 'exact_request_challenge_v1',
            authorization_challenge_sha256: 'f'.repeat(64),
        };

        const upgraded = saveForgeRequest(fixture.db, upgradedInput);
        assert.equal(upgraded.replayed, true);
        assert.equal(upgraded.challenge_upgraded, true);
        assert.equal(upgraded.request.status, 'PENDING_AUTH');
        assert.equal(upgraded.request.authorized_at, undefined);
        assert.equal(upgraded.request.expires_at, undefined);
        const exact = authorizeForgeRequest(fixture.db, forgeAuthorizationInput(upgradedInput));
        assert.equal(exact.request.status, 'AUTHORIZED');
        assert.equal(exact.authorization.authorization_profile, 'exact_request_challenge_v1');
        fixture.db.close();
    });

    it('does not extend a legacy challenge after any attempt was recorded', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:legacy-spent';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const legacy = forgeRequestInput(fixture.repoId, beadId, {
            authorization_profile: undefined,
            authorization_challenge_sha256: undefined,
        });
        saveLegacyAuthorizedForgeRequest(fixture.db, legacy);
        const now = Date.now();
        fixture.db.prepare(`
            INSERT INTO hall_forge_attempts (
                attempt_id, request_id, ordinal, idempotency_key,
                execution_receipt_id, adapter_ref, status, reserved_at, updated_at
            ) VALUES (?, ?, 1, ?, ?, ?, 'FAILED_FINAL', ?, ?)
        `).run(
            `legacy-attempt-${legacy.request_id}`, legacy.request_id, 'legacy-spent',
            `legacy-receipt-${legacy.request_id}`, legacy.adapter_ref, now, now,
        );

        assert.throws(
            () => saveForgeRequest(fixture.db, {
                ...legacy,
                authorization_profile: 'exact_request_challenge_v1',
                authorization_challenge_sha256: 'f'.repeat(64),
            }),
            /forge_request_legacy_upgrade_requires_unspent_request/,
        );
        fixture.db.close();
    });

    it('rolls back the authorization row when the request update loses its race', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:authorization-rollback';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const request = forgeRequestInput(fixture.repoId, beadId);
        saveForgeRequest(fixture.db, request);
        fixture.db.exec(`
            CREATE TRIGGER force_forge_authorization_update_abort
            AFTER INSERT ON hall_forge_authorizations
            BEGIN
                UPDATE hall_forge_requests SET status = 'REVOKED'
                WHERE request_id = NEW.request_id;
            END;
        `);

        assert.throws(
            () => authorizeForgeRequest(fixture.db, forgeAuthorizationInput(request)),
            /forge_request_authorization_race/,
        );
        assert.equal(getForgeAuthorizationByRequest(fixture.db, request.request_id), null);
        assert.equal(getForgeRequest(fixture.db, request.request_id)?.status, 'PENDING_AUTH');
        fixture.db.close();
    });
});
