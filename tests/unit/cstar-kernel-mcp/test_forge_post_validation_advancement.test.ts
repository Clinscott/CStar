import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';

import { handleForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleRecordResult } from
    '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import {
    advanceForgePostValidation,
} from '../../../src/tools/pennyone/intel/forge_post_validation_advancement.js';
import { finalizeForgeAttempt } from
    '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    cleanupNaturalAuthorizationTest,
    parse,
} from './forge_natural_authorization_test_support.js';
import {
    createAdvancementFixture,
    derivedRequestArgs,
    finalizeFixtureWithoutAdvancement,
    laterRootContext,
    recordFixtureResult,
    tableCount,
    validationEvidence,
    type AdvancementFixture,
} from './forge_post_validation_advancement_test_support.js';

const originalForgeTestMode = process.env.CSTAR_FORGE_TEST_MODE;

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

afterEach(() => {
    cleanupNaturalAuthorizationTest();
    restoreEnv('CSTAR_FORGE_TEST_MODE', originalForgeTestMode);
});

function scalar(fixture: AdvancementFixture, sql: string, ...args: unknown[]): number {
    return Number(fixture.value.db.prepare(sql).pluck().get(...args));
}

function childStatus(fixture: AdvancementFixture, index: number): string {
    return String(fixture.value.db.prepare(
        'SELECT status FROM hall_beads WHERE bead_id = ?',
    ).pluck().get(fixture.child_bead_ids[index]!));
}

function successorCount(fixture: AdvancementFixture): number {
    return requestCount(fixture, 1);
}

function requestCount(fixture: AdvancementFixture, index: number): number {
    return scalar(
        fixture,
        'SELECT COUNT(*) FROM hall_forge_requests WHERE bead_id = ?',
        fixture.child_bead_ids[index]!,
    );
}

function advancementInput(fixture: AdvancementFixture, validationId: string) {
    return {
        db: fixture.value.db,
        control_root: fixture.value.root,
        code_root: fixture.value.root,
        execution_receipt_id: fixture.execution_receipt_id,
        validation_id: validationId,
        request_id: fixture.request.receipt_id as string,
        request_sha256: fixture.request.request_sha256 as string,
    };
}

function assertValidationRetained(fixture: AdvancementFixture, validationId: string): void {
    const attempt = fixture.value.db.prepare(`
        SELECT status, validation_id, validation_authority
        FROM hall_forge_attempts WHERE attempt_id = ?
    `).get(fixture.attempt_id) as Record<string, unknown>;
    assert.deepEqual(attempt, {
        status: 'SUCCEEDED',
        validation_id: validationId,
        validation_authority: 'verified_v2',
    });
    assert.equal(scalar(
        fixture,
        'SELECT COUNT(*) FROM hall_validation_runs WHERE validation_id = ?',
        validationId,
    ), 1);
}

describe('Forge post-validation Augury v2 advancement', () => {
    it('resolves the accepted child and authorizes exactly one successor with exact replay', async () => {
        const fixture = await createAdvancementFixture('success-replay');
        const validationId = 'val-phase4b-success-replay';
        const first = await recordFixtureResult(fixture, validationId);

        assert.equal(first.status, 'recorded_verified', JSON.stringify(first));
        assert.equal(first.authoritative, true);
        assert.equal(first.validation_persisted, true);
        assert.equal(first.forge_validation.accepted, true);
        assert.equal(first.forge_validation.execution_status_changed, true);
        assert.equal(first.forge_advancement.status, 'successor_authorized');
        assert.equal(first.forge_advancement.replayed, false);
        assert.equal(first.forge_advancement.validation_retained, true);
        assert.equal(first.forge_advancement.next_bead_id, fixture.child_bead_ids[1]);
        assert.equal(childStatus(fixture, 0), 'RESOLVED');
        assert.equal(childStatus(fixture, 1), 'IN_PROGRESS');
        assert.equal(successorCount(fixture), 1);
        assert.equal(tableCount(fixture, 'hall_forge_requests'), 2);
        assert.equal(tableCount(fixture, 'hall_forge_authorizations'), 2);
        assert.equal(tableCount(fixture, 'hall_forge_mission_grant_requests'), 2);
        assert.equal(tableCount(fixture, 'hall_forge_attempts'), 1);
        assert.equal(tableCount(fixture, 'hall_forge_mission_grant_reservations'), 0);
        const workerTable = scalar(
            fixture,
            `SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'hall_worker_jobs'`,
        );
        if (workerTable === 1) assert.equal(tableCount(fixture, 'hall_worker_jobs'), 0);
        assert.equal(scalar(
            fixture,
            `SELECT COUNT(*) FROM hall_forge_attempts
             WHERE live_spend = 1 OR known_spend_observed = 1
                OR live_source_collection = 1`,
        ), 0);
        const successor = JSON.parse(String(fixture.value.db.prepare(`
            SELECT request_summary_json FROM hall_forge_requests WHERE bead_id = ?
        `).pluck().get(fixture.child_bead_ids[1]!)));
        assert.equal(successor.decision_id, `${fixture.receipt.mission_decision_id}:batch-2`);
        assert.equal(successor.max_attempts, 1);
        assert.equal(successor.retry_budget, 0);
        assert.equal(successor.fixture_policy, 'synthetic_only');
        assert.equal(successor.spend_policy.max_retries, 0);
        assert.equal(successor.spend_policy.live_source_allowed, false);
        assert.equal(successor.callback_contract.callback_thread_id, fixture.session.threadId);
        assert.equal(successor.adapter_ref, 'cstar-forge-hermes-minimax-adapter');
        assert.ok(successor.adapter_runtime);

        const replay = await recordFixtureResult(fixture, validationId);
        assert.equal(replay.status, 'recorded_verified', JSON.stringify(replay));
        assert.equal(replay.forge_validation.execution_status_changed, false);
        assert.equal(replay.forge_advancement.status, 'successor_authorized');
        assert.equal(replay.forge_advancement.replayed, true);
        assert.equal(
            replay.forge_advancement.next_request_id,
            first.forge_advancement.next_request_id,
        );
        assert.equal(successorCount(fixture), 1);
        assert.equal(tableCount(fixture, 'hall_forge_attempts'), 1);
    });

    it('does not trigger for rejection, inconclusive, unverified, or terminal evidence', async () => {
        const rejected = await createAdvancementFixture('rejected');
        const rejectedResult = await recordFixtureResult(
            rejected, 'val-phase4b-rejected', 'FAILURE',
        );
        assert.equal(rejectedResult.forge_advancement.status, 'not_triggered');
        assert.equal(
            rejectedResult.forge_advancement.error_code,
            'forge_advancement_validation_not_accepted',
        );
        assert.equal(childStatus(rejected, 0), 'IN_PROGRESS');
        assert.equal(successorCount(rejected), 0);
        cleanupNaturalAuthorizationTest();

        const inconclusive = await createAdvancementFixture('inconclusive');
        const inconclusiveResult = parse(await handleRecordResult({
            bead_id: inconclusive.child_bead_ids[0]!,
            verdict: 'INCONCLUSIVE',
            validation_id: 'val-phase4b-inconclusive',
            forge_execution_receipt_id: inconclusive.execution_receipt_id,
            validation_evidence: validationEvidence(inconclusive),
        }, inconclusive.context));
        assert.equal(inconclusiveResult.status, 'partial');
        assert.equal(inconclusiveResult.validation_persisted, false);
        assert.equal(inconclusiveResult.forge_advancement, undefined);
        assert.equal(childStatus(inconclusive, 0), 'IN_PROGRESS');
        cleanupNaturalAuthorizationTest();

        const unverified = await createAdvancementFixture('unverified');
        const unverifiedResult = parse(await handleRecordResult({
            bead_id: unverified.child_bead_ids[0]!,
            verdict: 'SUCCESS',
            validation_id: 'val-phase4b-unverified',
            forge_execution_receipt_id: unverified.execution_receipt_id,
        }, unverified.context));
        assert.equal(unverifiedResult.status, 'partial');
        assert.equal(unverifiedResult.validation_persisted, false);
        assert.equal(childStatus(unverified, 0), 'IN_PROGRESS');
        cleanupNaturalAuthorizationTest();

        const terminal = await createAdvancementFixture('terminal');
        finalizeForgeAttempt(terminal.value.db, {
            attempt_id: terminal.attempt_id,
            status: 'FAILED_FINAL',
            error_code: 'synthetic_terminal',
        });
        const terminalResult = await recordFixtureResult(
            terminal, 'val-phase4b-terminal', 'FAILURE',
        );
        assert.equal(terminalResult.forge_validation.mode, 'terminal_evidence_link');
        assert.equal(terminalResult.forge_advancement.status, 'not_triggered');
        assert.match(terminalResult.forge_advancement.error_code, /terminal_evidence_link/);
        assert.equal(childStatus(terminal, 0), 'IN_PROGRESS');
    });

    it('returns domain_terminal and batch_complete without a successor request', async () => {
        const domain = await createAdvancementFixture('domain-terminal', {
            lanes: ['forge', 'corvus_eye'],
        });
        const domainResult = await recordFixtureResult(
            domain, 'val-phase4b-domain-terminal',
        );
        assert.equal(domainResult.forge_advancement.status, 'domain_terminal');
        assert.equal(domainResult.forge_advancement.next_lane, 'corvus_eye');
        assert.equal(childStatus(domain, 0), 'RESOLVED');
        assert.equal(successorCount(domain), 0);
        cleanupNaturalAuthorizationTest();

        const complete = await createAdvancementFixture('batch-complete', {
            lanes: ['forge'],
        });
        const completeResult = await recordFixtureResult(
            complete, 'val-phase4b-batch-complete',
        );
        assert.equal(completeResult.forge_advancement.status, 'batch_complete');
        assert.equal(completeResult.forge_advancement.next_bead_id, null);
        assert.equal(childStatus(complete, 0), 'RESOLVED');
        assert.equal(tableCount(complete, 'hall_forge_requests'), 1);
    });

    it('replays an exact manual successor and rejects a divergent manual conflict', async () => {
        const exact = await createAdvancementFixture('manual-exact');
        const exactResult = await recordFixtureResult(
            exact, 'val-phase4b-manual-exact',
        );
        assert.equal(exactResult.status, 'recorded_verified', JSON.stringify(exactResult));
        assert.equal(exactResult.forge_advancement.status, 'successor_authorized');
        const exactContext = laterRootContext(exact);
        const manual = parse(await handleForgeRequest(
            derivedRequestArgs(exact, 1), exactContext,
        ));
        assert.equal(manual.status, 'AUTHORIZED', JSON.stringify(manual));
        assert.equal(exactResult.forge_advancement.next_request_id, manual.receipt_id);
        assert.equal(successorCount(exact), 1);
        cleanupNaturalAuthorizationTest();

        const divergent = await createAdvancementFixture('manual-divergent');
        const divergentResult = await recordFixtureResult(
            divergent, 'val-phase4b-manual-divergent',
        );
        assert.equal(divergentResult.status, 'recorded_verified');
        assert.equal(divergentResult.forge_advancement.status, 'successor_authorized');
        const divergentContext = laterRootContext(divergent);
        const divergentArgs = derivedRequestArgs(divergent, 1);
        divergentArgs.objective = 'Divergent manual objective.';
        const conflicting = parse(await handleForgeRequest(divergentArgs, divergentContext));
        assert.match(conflicting.error_code, /decision_conflict/);
        assertValidationRetained(divergent, 'val-phase4b-manual-divergent');
        assert.equal(childStatus(divergent, 0), 'RESOLVED');
        assert.equal(successorCount(divergent), 1);
    });

    it('rolls back advancement for revoked, expired, exhausted, or spent capacity', async () => {
        for (const [label, mutate, pattern] of [
            ['revoked', (fixture: AdvancementFixture) => fixture.value.db.prepare(`
                UPDATE hall_forge_mission_grants
                SET status = 'REVOKED', revocation_state = 'REVOKED'
            `).run(), /forge_mission_grant_revoked/],
            ['expired', (fixture: AdvancementFixture) => fixture.value.db.prepare(`
                UPDATE hall_forge_mission_grants SET expires_at = 1
            `).run(), /forge_mission_grant_expired/],
            ['exhausted', (fixture: AdvancementFixture) => fixture.value.db.prepare(`
                UPDATE hall_forge_mission_grants SET status = 'EXHAUSTED'
            `).run(), /forge_mission_grant_not_active|capacity_exhausted/],
        ] as const) {
            const fixture = await createAdvancementFixture(`grant-${label}`);
            mutate(fixture);
            const validationId = `val-phase4b-grant-${label}`;
            const result = await recordFixtureResult(fixture, validationId);
            assert.equal(result.forge_advancement.status, 'failed');
            assert.match(result.forge_advancement.error_code, pattern);
            assertValidationRetained(fixture, validationId);
            assert.equal(childStatus(fixture, 0), 'IN_PROGRESS');
            assert.equal(successorCount(fixture), 0);
            cleanupNaturalAuthorizationTest();
        }
        const capacity = await createAdvancementFixture('grant-capacity', {
            provider_ceiling: 1,
        });
        const capacityResult = await recordFixtureResult(
            capacity, 'val-phase4b-grant-capacity',
        );
        assert.equal(capacityResult.forge_advancement.status, 'failed');
        assert.match(capacityResult.forge_advancement.error_code, /capacity_exhausted/);
        assertValidationRetained(capacity, 'val-phase4b-grant-capacity');
        assert.equal(childStatus(capacity, 0), 'IN_PROGRESS');
    });

    it('detects receipt, template, and dependency-edge tamper after validation commits', async () => {
        for (const [label, mutate, pattern] of [
            ['receipt', (fixture: AdvancementFixture) => fixture.value.db.prepare(`
                UPDATE hall_augury_mission_receipts
                SET canonical_receipt_sha256 = ?
            `).run('0'.repeat(64)), /receipt_drift/],
            ['template', (fixture: AdvancementFixture) => fixture.value.db.prepare(`
                UPDATE hall_augury_mission_receipt_membership
                SET plan_item_sha256 = ? WHERE plan_order = 1
            `).run('0'.repeat(64)), /membership_drift/],
            ['edge', (fixture: AdvancementFixture) => fixture.value.db.prepare(`
                UPDATE hall_augury_mission_dependency_edges
                SET edge_sha256 = ? WHERE dependency_order = 1
            `).run('0'.repeat(64)), /dependency_edge_drift/],
        ] as const) {
            const fixture = await createAdvancementFixture(`tamper-${label}`);
            mutate(fixture);
            const validationId = `val-phase4b-tamper-${label}`;
            const result = await recordFixtureResult(fixture, validationId);
            assert.equal(result.forge_advancement.status, 'failed');
            assert.match(result.forge_advancement.error_code, pattern);
            assertValidationRetained(fixture, validationId);
            assert.equal(childStatus(fixture, 0), 'IN_PROGRESS');
            cleanupNaturalAuthorizationTest();
        }
    });

    it('rolls back failures after resolution, request, authorization, and grant link', async () => {
        for (const [label, install] of [
            ['resolution', (fixture: AdvancementFixture) => ({
                after_resolution: () => { throw new Error('injected_after_resolution'); },
            })],
            ['request', (fixture: AdvancementFixture) => ({
                after_request: () => { throw new Error('injected_after_request'); },
            })],
            ['authorization', (_fixture: AdvancementFixture) => ({
                after_authorization: () => { throw new Error('injected_after_authorization'); },
            })],
            ['before-link', (fixture: AdvancementFixture) => {
                fixture.value.db.exec(`
                    CREATE TRIGGER inject_link_failure
                    BEFORE INSERT ON hall_forge_mission_grant_requests
                    BEGIN SELECT RAISE(ABORT, 'injected_after_auth_before_link'); END;
                `);
                return {};
            }],
            ['after-link', (fixture: AdvancementFixture) => {
                fixture.value.db.exec(`
                    CREATE TRIGGER inject_after_link_failure
                    BEFORE UPDATE OF status ON hall_forge_requests
                    WHEN OLD.status = 'PENDING_AUTH' AND NEW.status = 'AUTHORIZED'
                    BEGIN SELECT RAISE(ABORT, 'injected_after_link_before_authorized'); END;
                `);
                return {};
            }],
        ] as const) {
            const fixture = await createAdvancementFixture(`rollback-${label}`);
            const validationId = `val-phase4b-rollback-${label}`;
            finalizeFixtureWithoutAdvancement(fixture, validationId);
            await assert.rejects(
                () => advanceForgePostValidation({
                    ...advancementInput(fixture, validationId),
                    test_hooks: install(fixture),
                }),
                /injected_/,
            );
            assertValidationRetained(fixture, validationId);
            assert.equal(childStatus(fixture, 0), 'IN_PROGRESS');
            assert.equal(successorCount(fixture), 0);
            assert.equal(tableCount(fixture, 'hall_forge_authorizations'), 1);
            assert.equal(tableCount(fixture, 'hall_forge_mission_grant_requests'), 1);
            cleanupNaturalAuthorizationTest();
        }
    });

    it('binds Sterling to immutable Lore and Isolation bytes', async () => {
        for (const [label, pathOf] of [
            ['lore', (fixture: AdvancementFixture) => fixture.lore_path],
            ['isolation', (fixture: AdvancementFixture) => fixture.isolation_path],
        ] as const) {
            const fixture = await createAdvancementFixture(`byte-drift-${label}`);
            const validationId = `val-phase4b-byte-drift-${label}`;
            finalizeFixtureWithoutAdvancement(fixture, validationId);
            fs.appendFileSync(pathOf(fixture), 'drift\n');
            await assert.rejects(
                () => advanceForgePostValidation(advancementInput(fixture, validationId)),
                /Sterling Mandate REJECTED/,
            );
            assertValidationRetained(fixture, validationId);
            assert.equal(childStatus(fixture, 0), 'IN_PROGRESS');
            assert.equal(successorCount(fixture), 0);
            cleanupNaturalAuthorizationTest();
        }
    });

    it('serializes two exact validation calls without duplicate advancement', async () => {
        const fixture = await createAdvancementFixture('concurrent-validation');
        const validationId = 'val-phase4b-concurrent-validation';
        const [left, right] = await Promise.all([
            recordFixtureResult(fixture, validationId),
            recordFixtureResult(fixture, validationId),
        ]);
        const statuses = [left.forge_advancement?.status, right.forge_advancement?.status];
        assert.ok(statuses.includes('successor_authorized'));
        assert.equal(successorCount(fixture), 1);
        assert.equal(tableCount(fixture, 'hall_forge_post_validation_advancements'), 1);
        assert.equal(tableCount(fixture, 'hall_forge_attempts'), 1);
    });

    it('serializes the atomic advancement receipt across two database connections', async () => {
        const fixture = await createAdvancementFixture('concurrent-connections');
        const validationId = 'val-phase4b-concurrent-connections';
        finalizeFixtureWithoutAdvancement(fixture, validationId);
        const databasePath = (fixture.value.db.prepare('PRAGMA database_list').all() as
            Array<{ name: string; file: string }>).find((row) => row.name === 'main')!.file;
        const second = new Database(databasePath);
        second.pragma('foreign_keys = ON');
        second.pragma('busy_timeout = 5000');
        try {
            const [left, right] = await Promise.all([
                advanceForgePostValidation(advancementInput(fixture, validationId)),
                advanceForgePostValidation({
                    ...advancementInput(fixture, validationId),
                    db: second,
                }),
            ]);
            assert.equal(left.status, 'successor_authorized');
            assert.equal(right.status, 'successor_authorized');
            assert.equal([left.replayed, right.replayed].filter(Boolean).length, 1);
            assert.equal(successorCount(fixture), 1);
            assert.equal(tableCount(
                fixture, 'hall_forge_post_validation_advancements',
            ), 1);
        } finally {
            second.close();
        }
    });
});
