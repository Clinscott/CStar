import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import type Database from 'better-sqlite3';
import {
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { recordForgeDelivery } from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import {
    HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_NAME,
    HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL,
} from '../../../src/tools/pennyone/intel/schema_tables_runtime.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';
import {
    consumeIndependentValidatorTicket,
    issueIndependentValidatorTicket,
    type ValidationTicketIssueInput,
} from '../../../src/tools/pennyone/intel/validation_ticket_controller.js';

const VALIDATOR_A = '019f0000-0000-7000-8000-000000000501';
const VALIDATOR_B = '019f0000-0000-7000-8000-000000000502';
const TURN_A = '019f0000-0000-7000-8000-000000000503';
const TURN_B = '019f0000-0000-7000-8000-000000000504';
const openDatabases: Database.Database[] = [];

function fixture() {
    const hall = createForgeReceiptFixture();
    openDatabases.push(hall.db);
    const suffix = randomUUID().replaceAll('-', '');
    const beadId = `bead:test:ticket-rotation-${suffix}`;
    insertForgeReceiptBead(hall.db, hall.repoId, beadId);
    const request = forgeRequestInput(hall.repoId, beadId, {
        target_paths_sha256: 'd'.repeat(64),
    });
    const authorization = saveAndAuthorizeForgeRequest(hall.db, request).authorization;
    const attempt = reserveForgeAttempt(hall.db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `ticket-rotation-${suffix}`,
        execution_receipt_id: `forge-execute-${suffix}`,
        adapter_ref: request.adapter_ref ?? '',
    }).attempt;
    markForgeAttemptStarted(hall.db, attempt.attempt_id, request.now);
    recordForgeDelivery(hall.db, {
        attempt_id: attempt.attempt_id,
        result_status: 'synthetic-delivery',
        external_execution_id: `external-${suffix}`,
        now: request.now,
    });
    return { ...hall, beadId, request, attempt };
}

function issue(
    value: ReturnType<typeof fixture>,
    validatorThreadId: string,
    validatorTurnId: string,
    now: number,
    expiresAt: number,
    overrides: Partial<ValidationTicketIssueInput> = {},
) {
    return issueIndependentValidatorTicket(value.db, {
        repository_id: value.repoId,
        bead_id: value.beadId,
        execution_receipt_id: value.attempt.execution_receipt_id,
        attempt_id: value.attempt.attempt_id,
        scope_sha256: 'd'.repeat(64),
        validator_thread_id: validatorThreadId,
        validator_turn_id: validatorTurnId,
        now,
        expires_at: expiresAt,
        ...overrides,
    });
}

function consume(
    value: ReturnType<typeof fixture>,
    ticket: string,
    validatorThreadId: string,
    validatorTurnId: string,
    now: number,
) {
    return consumeIndependentValidatorTicket(value.db, {
        ticket,
        repository_id: value.repoId,
        bead_id: value.beadId,
        execution_receipt_id: value.attempt.execution_receipt_id,
        attempt_id: value.attempt.attempt_id,
        scope_sha256: 'd'.repeat(64),
        validator_thread_id: validatorThreadId,
        validator_turn_id: validatorTurnId,
        validation_id: `validation-${now}`,
        now,
    });
}

function normalizeSql(sql: string): string {
    return sql
        .replace(/\bIF\s+NOT\s+EXISTS\b/gi, '')
        .replace(/;\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function triggerSql(value: ReturnType<typeof fixture>): string {
    const row = value.db.prepare(
        'SELECT sql FROM sqlite_master WHERE type = \'trigger\' AND name = ?',
    ).get(HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_NAME) as
        { sql?: string } | undefined;
    return row?.sql ?? '';
}

function assertCanonicalTrigger(value: ReturnType<typeof fixture>): void {
    assert.notEqual(triggerSql(value), '');
    assert.equal(normalizeSql(triggerSql(value)), normalizeSql(
        HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL,
    ));
}

afterEach(() => {
    while (openDatabases.length > 0) openDatabases.pop()!.close();
    cleanupForgeReceiptFixtures();
});

describe('expired independent validator ticket rotation', () => {
    it('atomically replaces an expired ticket and preserves one-use semantics', () => {
        const value = fixture();
        const first = issue(value, VALIDATOR_A, TURN_A, 100, 110);
        const rotated = issue(value, VALIDATOR_B, TURN_B, 111, 211);
        assert.notEqual(rotated.ticket, first.ticket);
        assert.equal(value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_validation_tickets',
        ).get()?.count, 1);
        const row = value.db.prepare(`
            SELECT ticket_id, validator_thread_id, validator_turn_id, expires_at, consumed_at
            FROM hall_forge_validation_tickets
        `).get() as Record<string, unknown>;
        assert.equal(row.ticket_id, rotated.ticket_id);
        assert.equal(row.validator_thread_id, VALIDATOR_B);
        assert.equal(row.validator_turn_id, TURN_B);
        assert.equal(row.expires_at, 211);
        assert.equal(row.consumed_at, null);
        assertCanonicalTrigger(value);
        assert.throws(
            () => consume(value, first.ticket, VALIDATOR_A, TURN_A, 112),
            /validation_ticket_not_found/,
        );
        consume(value, rotated.ticket, VALIDATOR_B, TURN_B, 112);
        assert.throws(
            () => consume(value, rotated.ticket, VALIDATOR_B, TURN_B, 113),
            /validation_ticket_replayed/,
        );
    });

    it('rejects active and consumed tickets even after expiry', () => {
        const active = fixture();
        issue(active, VALIDATOR_A, TURN_A, 100, 200);
        assert.throws(
            () => issue(active, VALIDATOR_B, TURN_B, 150, 250),
            /validation_ticket_already_issued/,
        );

        const consumed = fixture();
        const first = issue(consumed, VALIDATOR_A, TURN_A, 100, 110);
        consume(consumed, first.ticket, VALIDATOR_A, TURN_A, 105);
        assert.throws(
            () => issue(consumed, VALIDATOR_B, TURN_B, 111, 211),
            /validation_ticket_already_issued/,
        );
        assert.equal(consumed.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_validation_tickets',
        ).get()?.count, 1);
    });

    it('runs binding checks before an expired ticket can rotate', () => {
        const value = fixture();
        const first = issue(value, VALIDATOR_A, TURN_A, 100, 110);
        assert.throws(
            () => issue(value, VALIDATOR_B, TURN_B, 111, 211, { repository_id: 'wrong-repository' }),
            /validation_ticket_repository_mismatch/,
        );
        assert.throws(
            () => issue(value, VALIDATOR_B, TURN_B, 111, 211, { scope_sha256: 'f'.repeat(64) }),
            /validation_ticket_scope_mismatch/,
        );
        assert.throws(
            () => issue(value, value.request.requester_thread_id, TURN_B, 111, 211),
            /validation_ticket_validator_not_independent/,
        );
        assert.equal(value.db.prepare(
            'SELECT ticket_id FROM hall_forge_validation_tickets',
        ).get()?.ticket_id, first.ticket_id);
    });

    it('rejects a weakened same-name trigger without blessing or rotating it', () => {
        const value = fixture();
        const first = issue(value, VALIDATOR_A, TURN_A, 100, 110);
        value.db.exec(`
            DROP TRIGGER ${HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_NAME};
            CREATE TRIGGER ${HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_NAME}
            BEFORE UPDATE ON hall_forge_validation_tickets
            BEGIN SELECT NULL; END;
        `);
        const weakened = triggerSql(value);
        assert.notEqual(normalizeSql(weakened), normalizeSql(
            HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL,
        ));
        assert.throws(
            () => issue(value, VALIDATOR_B, TURN_B, 111, 211),
            /validation_ticket_binding_invalid/,
        );
        const row = value.db.prepare(`
            SELECT ticket_id, validator_thread_id, expires_at
            FROM hall_forge_validation_tickets
        `).get() as Record<string, unknown>;
        assert.equal(row.ticket_id, first.ticket_id);
        assert.equal(row.validator_thread_id, VALIDATOR_A);
        assert.equal(row.expires_at, 110);
        assert.equal(triggerSql(value), weakened);
        assert.notEqual(normalizeSql(triggerSql(value)), normalizeSql(
            HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL,
        ));
    });

    it('rolls back a failed replacement without losing the old ticket', () => {
        const value = fixture();
        const first = issue(value, VALIDATOR_A, TURN_A, 100, 110);
        value.db.exec(`
            CREATE TRIGGER synthetic_ticket_rotation_abort
            BEFORE UPDATE OF ticket_id ON hall_forge_validation_tickets
            BEGIN SELECT RAISE(ABORT, 'synthetic_ticket_rotation_abort'); END;
        `);
        assert.throws(
            () => issue(value, VALIDATOR_B, TURN_B, 111, 211),
            /synthetic_ticket_rotation_abort/,
        );
        assert.equal(value.db.prepare(
            'SELECT ticket_id, consumed_at FROM hall_forge_validation_tickets',
        ).get()?.ticket_id, first.ticket_id);
        assertCanonicalTrigger(value);
        consume(value, first.ticket, VALIDATOR_A, TURN_A, 105);
    });
});
