import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';

import {
    acceptWorkerJob,
    beginWorkerJobValidation,
    deliverWorkerJobArtifacts,
    recordWorkerJobValidation,
    stageWorkerJobArtifact,
} from '../../../src/tools/pennyone/intel/worker_job_artifact_ledger.js';
import {
    createWorkerJob,
    markWorkerJobRunning,
    recordWorkerJobExecutionEvidence,
    reserveWorkerJobDispatch,
} from '../../../src/tools/pennyone/intel/worker_job_ledger.js';
import {
    freezeWorkerJobUnknown,
    queueWorkerJobRepair,
    replayWorkerJobAfterZeroProvider,
} from '../../../src/tools/pennyone/intel/worker_job_lifecycle.js';
import { migrateSyntheticWorkerJobLedger } from '../../../src/tools/pennyone/intel/worker_job_subordinate_migration.js';
import {
    buildForgeHostDispatchHandoff,
    buildForgeExecutionOwnerProof,
    parseForgeHostDispatchHandoff,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_execution_owner.js';
import {
    classifyForgeAttemptForDurableDispatch,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_attempt_recovery.js';
import type { ExecutableWorkerJobContract } from '../../../src/types/worker_job.js';
import type { HallForgeAttemptRecord } from '../../../src/types/forge.js';

const NOW = 2_000_000;
const hash = (character: string) => character.repeat(64);

function fixture(suffix: string): ExecutableWorkerJobContract {
    const attemptId = `forge-attempt-a3-${suffix}`;
    return {
        worker_kind: 'forge',
        bead_id: 'bead:cstar:auto-a3-durable-dispatch-20260802',
        decision_id: 'decision:cstar-auto-a3-durable-dispatch-20260802',
        canonical_request_id: `dispatch-forge-auto-a3-${suffix}`,
        canonical_request_sha256: hash('a'),
        authorization_id: `forge-auth-auto-a3-${suffix}`,
        authorization_expires_at: NOW + 20_000,
        adapter_runtime_binding_sha256: hash('b'),
        idempotency_key: `worker-job-a3-idempotency-${suffix}`,
        execution_deadline_at: NOW + 15_000,
        attempt_id: attemptId,
        objective: 'Deliver one bounded asynchronous A3 artifact.',
        expected_artifacts: [
            { name: 'result.md', artifact_kind: 'report', required: true },
        ],
        provider_evidence: {
            attempt_id: attemptId,
            provider_started: false,
            provider_requests_started: 0,
            observed_at: NOW,
            evidence_sha256: hash('c'),
        },
        spend_evidence: {
            attempt_id: attemptId,
            spend_uncertain: false,
            known_spend_observed: false,
            observed_at: NOW,
            evidence_sha256: hash('d'),
        },
    };
}

function db(): Database.Database {
    const database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migrateSyntheticWorkerJobLedger(database, { now: NOW });
    return database;
}

function running(database: Database.Database, suffix: string) {
    const created = createWorkerJob(database, fixture(suffix), NOW).job;
    const dispatch = reserveWorkerJobDispatch(
        database, created.job_id, 'a3-host', 2_000, NOW + 1,
    );
    const job = markWorkerJobRunning(
        database, created.job_id, dispatch.lease_token, NOW + 2,
    );
    return { created, dispatch, job };
}

function zeroProof(attemptId: string) {
    return {
        attempt_id: attemptId,
        provider_requests_started: 0 as const,
        known_spend_observed: false as const,
        spend_uncertain: false as const,
        observed_at: NOW + 20,
        evidence_sha256: hash('9'),
    };
}

function replayAuthorization(leaseToken: string, owner = 'a3-host') {
    return { lease_owner_id: owner, lease_token: leaseToken };
}

describe('durable asynchronous dispatch seam', () => {
    it('atomically reserves one concurrent dispatch and leaves launch to the host', async () => {
        const database = db();
        const created = createWorkerJob(database, fixture('queue'), NOW).job;
        const race = await Promise.allSettled([
            Promise.resolve().then(() => reserveWorkerJobDispatch(
                database, created.job_id, 'a3-host', 2_000, NOW + 1,
            )),
            Promise.resolve().then(() => reserveWorkerJobDispatch(
                database, created.job_id, 'a3-host', 2_000, NOW + 1,
            )),
        ]);
        assert.equal(race.filter((outcome) => outcome.status === 'fulfilled').length, 1);
        assert.equal(race.filter((outcome) => outcome.status === 'rejected').length, 1);
        const reservation = race.find((outcome) => outcome.status === 'fulfilled')!.value;
        assert.equal(database.prepare(
            'SELECT COUNT(*) FROM hall_worker_job_leases WHERE job_id = ?',
        ).pluck().get(created.job_id), 1, 'the concurrent lease race must have one winner');
        assert.equal(database.prepare(
            "SELECT COUNT(*) FROM hall_worker_job_events WHERE job_id = ? AND event_kind = 'leased'",
        ).pluck().get(created.job_id), 1, 'the concurrent lease race must record one lease');
        assert.equal(reservation.job.state, 'LEASED');
        assert.match(reservation.dispatch_id, /^worker-dispatch-[a-f0-9]{32}$/);
        assert.equal(reservation.host_launch_required, true);
        assert.equal(reservation.cstar_launch, false);
        assert.equal(database.prepare(
            'SELECT COUNT(*) FROM hall_worker_jobs WHERE job_id = ?',
        ).pluck().get(created.job_id), 1);
        const secondAttempt = fixture('queue-second');
        secondAttempt.canonical_request_id = created.canonical_request_id;
        assert.throws(
            () => createWorkerJob(database, secondAttempt, NOW + 2),
            /Only one provider-bearing attempt may be reserved/,
        );
        database.close();
    });

    it('separates delivery, validation, and acceptance with idempotent validation replay', () => {
        const database = db();
        const { created, dispatch } = running(database, 'accept');
        const attempt = created.attempt_id;
        recordWorkerJobExecutionEvidence(database, created.job_id, dispatch.lease_token, {
            attempt_id: attempt,
            provider_started: true,
            provider_requests_started: 1,
            observed_at: NOW + 3,
            evidence_sha256: hash('e'),
        }, {
            attempt_id: attempt,
            spend_uncertain: false,
            known_spend_observed: true,
            observed_at: NOW + 3,
            evidence_sha256: hash('f'),
        }, NOW + 4);
        stageWorkerJobArtifact(database, created.job_id, dispatch.lease_token, {
            artifact_id: 'a3-artifact-accept',
            attempt_id: attempt,
            artifact_kind: 'report',
            name: 'result.md',
            media_type: 'text/markdown',
            byte_count: 10,
            sha256: hash('1'),
            storage_ref: 'cstar-storage:a3/accept',
        }, NOW + 5);
        const delivered = deliverWorkerJobArtifacts(
            database, created.job_id, dispatch.lease_token, NOW + 6,
        );
        assert.equal(delivered.state, 'DELIVERED_UNVERIFIED');
        assert.equal(beginWorkerJobValidation(database, created.job_id, NOW + 7).state, 'VALIDATING');
        const validation = {
            validation_id: 'a3-validation-accept',
            verdict: 'ACCEPTED' as const,
            evidence_sha256: hash('2'),
            summary: 'Independent artifact checks passed.',
        };
        assert.equal(acceptWorkerJob(database, created.job_id, validation, NOW + 8).state, 'ACCEPTED');
        assert.equal(recordWorkerJobValidation(
            database, created.job_id, validation, NOW + 9,
        ).state, 'ACCEPTED');
        assert.equal(database.prepare(
            'SELECT validation_id, validation_verdict FROM hall_worker_jobs WHERE job_id = ?',
        ).get(created.job_id)?.validation_verdict, 'ACCEPTED');
        database.close();
    });

    it('authorizes one atomic owner-bound zero-provider replay and enforces the ceiling', async () => {
        const database = db();
        const { created, dispatch } = running(database, 'repair');
        const proof = zeroProof(created.attempt_id);
        const repair = queueWorkerJobRepair(database, created.job_id, dispatch.lease_token, {
            failure_code: 'LOCAL_ARTIFACT_STAGING_FAILED',
            failure_summary: 'The local staging directory was unavailable.',
            zero_provider_proof: proof,
        }, NOW + 21);
        assert.equal(repair.state, 'REPAIR_QUEUED');
        assert.match(
            database.prepare(
                "SELECT detail FROM hall_worker_job_events WHERE event_kind = 'repair_queued'",
            ).pluck().get() as string,
            /same_mission=bead:cstar:auto-a3-durable-dispatch-20260802/,
        );
        assert.throws(
            () => replayWorkerJobAfterZeroProvider(
                database, created.job_id, proof,
                replayAuthorization(dispatch.lease_token, 'a3-host-transfer'), NOW + 22,
            ),
            /Only the exact repair owner may replay/,
        );
        assert.equal(database.prepare(
            'SELECT state FROM hall_worker_jobs WHERE job_id = ?',
        ).pluck().get(created.job_id), 'REPAIR_QUEUED');
        assert.throws(
            () => replayWorkerJobAfterZeroProvider(
                database, created.job_id, proof,
                replayAuthorization('wrong-replay-token'), NOW + 22,
            ),
            /lease is invalid/,
        );
        const replayRace = await Promise.allSettled([
            Promise.resolve().then(() => replayWorkerJobAfterZeroProvider(
                database, created.job_id, proof,
                replayAuthorization(dispatch.lease_token), NOW + 22,
            )),
            Promise.resolve().then(() => replayWorkerJobAfterZeroProvider(
                database, created.job_id, proof,
                replayAuthorization(dispatch.lease_token), NOW + 22,
            )),
        ]);
        assert.equal(replayRace.filter((outcome) => outcome.status === 'fulfilled').length, 1);
        assert.equal(replayRace.filter((outcome) => outcome.status === 'rejected').length, 1);
        assert.equal(database.prepare(
            'SELECT state, retry_count FROM hall_worker_jobs WHERE job_id = ?',
        ).get(created.job_id)?.retry_count, 1);
        assert.equal(database.prepare(
            'SELECT COUNT(*) FROM hall_worker_job_leases WHERE job_id = ?',
        ).pluck().get(created.job_id), 0);
        assert.throws(
            () => replayWorkerJobAfterZeroProvider(
                database, created.job_id, proof,
                replayAuthorization(dispatch.lease_token), NOW + 22,
            ),
            /Cannot replay a QUEUED worker job/,
        );
        assert.throws(
            () => reserveWorkerJobDispatch(
                database, created.job_id, 'a3-host-transfer', 2_000, NOW + 23,
            ),
            /ownership transfer is not authorized/,
        );
        assert.equal(database.prepare(
            'SELECT dispatch_owner_id FROM hall_worker_jobs WHERE job_id = ?',
        ).pluck().get(created.job_id), 'a3-host');
        const replayDispatch = reserveWorkerJobDispatch(
            database, created.job_id, 'a3-host', 2_000, NOW + 23,
        );
        assert.equal(replayDispatch.job.job_id, created.job_id);
        assert.equal(replayDispatch.job.attempt_id, created.attempt_id);
        assert.equal(database.prepare(
            'SELECT COUNT(*) FROM hall_worker_jobs WHERE canonical_request_id = ?',
        ).pluck().get(created.canonical_request_id), 1);
        markWorkerJobRunning(database, created.job_id, replayDispatch.lease_token, NOW + 24);
        assert.throws(
            () => queueWorkerJobRepair(database, created.job_id, replayDispatch.lease_token, {
                failure_code: 'LOCAL_ARTIFACT_STAGING_FAILED',
                zero_provider_proof: { ...proof, observed_at: NOW + 25 },
            }, NOW + 25),
            /bounded repair ceiling is exhausted/,
        );
        database.close();

        const staleDatabase = db();
        const stale = running(staleDatabase, 'stale-replay');
        const staleProof = zeroProof(stale.created.attempt_id);
        queueWorkerJobRepair(staleDatabase, stale.created.job_id, stale.dispatch.lease_token, {
            failure_code: 'LOCAL_REPAIR_STALE_TOKEN', zero_provider_proof: staleProof,
        }, NOW + 21);
        assert.throws(
            () => replayWorkerJobAfterZeroProvider(
                staleDatabase, stale.created.job_id, staleProof,
                replayAuthorization(stale.dispatch.lease_token), NOW + 2_002,
            ),
            /lease expired/,
        );
        assert.equal(staleDatabase.prepare(
            'SELECT state FROM hall_worker_jobs WHERE job_id = ?',
        ).pluck().get(stale.created.job_id), 'REPAIR_QUEUED');
        staleDatabase.close();
    });

    it('freezes ambiguous spend and rejects evidence regression or replay', () => {
        const database = db();
        const { created, dispatch } = running(database, 'frozen');
        for (const count of [-1, 1.5, 7]) {
            assert.throws(
                () => recordWorkerJobExecutionEvidence(database, created.job_id, dispatch.lease_token, {
                    attempt_id: created.attempt_id,
                    provider_started: true,
                    provider_requests_started: count,
                    observed_at: NOW + 3,
                    evidence_sha256: hash('3'),
                }, {
                    attempt_id: created.attempt_id,
                    spend_uncertain: false,
                    known_spend_observed: false,
                    observed_at: NOW + 3,
                    evidence_sha256: hash('4'),
                }, NOW + 4),
                /Provider and spend evidence must bind the active started attempt/,
            );
        }
        recordWorkerJobExecutionEvidence(database, created.job_id, dispatch.lease_token, {
            attempt_id: created.attempt_id,
            provider_started: true,
            provider_requests_started: 1,
            observed_at: NOW + 3,
            evidence_sha256: hash('3'),
        }, {
            attempt_id: created.attempt_id,
            spend_uncertain: true,
            known_spend_observed: false,
            observed_at: NOW + 3,
            evidence_sha256: hash('4'),
        }, NOW + 4);
        assert.throws(
            () => recordWorkerJobExecutionEvidence(database, created.job_id, dispatch.lease_token, {
                attempt_id: created.attempt_id,
                provider_started: true,
                provider_requests_started: 1,
                observed_at: NOW + 5,
                evidence_sha256: hash('5'),
            }, {
                attempt_id: created.attempt_id,
                spend_uncertain: false,
                known_spend_observed: false,
                observed_at: NOW + 5,
                evidence_sha256: hash('6'),
            }, NOW + 6),
            /Provider and spend evidence may only move forward/,
        );
        assert.equal(freezeWorkerJobUnknown(
            database, created.job_id, 'AMBIGUOUS_PROVIDER_SPEND', 'Provider outcome is unknown.', NOW + 7,
        ).state, 'UNKNOWN');
        assert.throws(
            () => replayWorkerJobAfterZeroProvider(
                database, created.job_id, zeroProof(created.attempt_id),
                replayAuthorization(dispatch.lease_token), NOW + 8,
            ),
            /UNKNOWN worker jobs cannot be replayed/,
        );
        database.close();
    });

    it('keeps Forge host-owned and fails closed adversarial spend, status, and result shapes', () => {
        const owner = buildForgeExecutionOwnerProof();
        assert.ok(owner);
        const handoff = buildForgeHostDispatchHandoff('worker-dispatch-a3', 'attempt-a3', owner);
        assert.ok(handoff);
        assert.equal(parseForgeHostDispatchHandoff(handoff)?.cstar_launch, false);
        const base = {
            attempt_id: 'attempt-a3', request_id: 'request-a3', ordinal: 1,
            idempotency_key: 'idempotency-a3', execution_receipt_id: 'forge-execute-a3',
            adapter_ref: 'hermes', attempt_budget_class: 'provider_or_unknown' as const,
            provider_evidence_valid: 0 as const, live_spend_unknown: 1 as const,
            known_spend_observed: 0 as const, status: 'UNKNOWN' as const,
            reserved_at: NOW, updated_at: NOW,
        } as HallForgeAttemptRecord;
        const classification = classifyForgeAttemptForDurableDispatch(base);
        assert.equal(classification.state, 'unknown');
        assert.equal(classification.retry_allowed, false);
        assert.equal(classification.provider_spend_state, 'ambiguous');

        const exactZero = {
            ...base,
            attempt_budget_class: 'mechanical_no_provider' as const,
            provider_evidence_valid: 1 as const,
            provider_requests_started: 0,
            provider_requests_completed: 0,
            provider_requests_ambiguous: 0,
            live_spend: 0 as const,
            live_spend_unknown: 0 as const,
            status: 'FAILED_RETRYABLE' as const,
        };
        assert.deepEqual(classifyForgeAttemptForDurableDispatch(exactZero), {
            state: 'repair_queued', retry_allowed: true, provider_spend_state: 'not_started',
        });
        assert.deepEqual(classifyForgeAttemptForDurableDispatch({
            ...exactZero, provider_requests_started: 1, known_spend_observed: 1,
        }), {
            state: 'domain_terminal', retry_allowed: false, provider_spend_state: 'known',
        }, 'known-spend retry must fail closed');
        assert.deepEqual(classifyForgeAttemptForDurableDispatch({
            ...exactZero, live_spend_unknown: 1,
        }), {
            state: 'unknown', retry_allowed: false, provider_spend_state: 'ambiguous',
        });
        assert.equal(classifyForgeAttemptForDurableDispatch({
            ...exactZero, status: 'UNRECOGNIZED_TERMINAL',
        } as unknown as HallForgeAttemptRecord).state, 'unknown', 'unknown status must freeze');
        assert.equal(classifyForgeAttemptForDurableDispatch({
            ...exactZero, result_status: 'UNRECOGNIZED_RESULT',
        }).retry_allowed, false, 'unknown result must not replay');
        assert.deepEqual(classifyForgeAttemptForDurableDispatch({
            ...exactZero,
            status: 'SUCCEEDED',
            result_status: 'unexpected-success-payload',
        }), {
            state: 'unknown', retry_allowed: false, provider_spend_state: 'not_started',
        });
        const accepted = {
            ...exactZero,
            attempt_budget_class: 'provider_or_unknown' as const,
            status: 'SUCCEEDED',
            result_status: 'VALIDATION_ACCEPTED',
            provider_requests_started: 6,
            provider_requests_completed: 6,
            live_spend: 1 as const,
            known_spend_observed: 1 as const,
            validation_id: 'validation-a3',
            validation_verdict: 'ACCEPTED',
            validation_authority: 'verified_v2',
            validation_evidence_sha256: hash('8'),
            result_artifact_sha256: hash('7'),
        };
        assert.equal(classifyForgeAttemptForDurableDispatch(accepted).state, 'accepted');
        const zeroRequestLiveSpend = classifyForgeAttemptForDurableDispatch({
            ...accepted,
            provider_requests_started: 0,
            provider_requests_completed: 0,
            live_spend: 1,
            known_spend_observed: 0,
        });
        assert.equal(zeroRequestLiveSpend.state, 'unknown');
        assert.equal(zeroRequestLiveSpend.retry_allowed, false);
        const zeroRequestKnownSpend = classifyForgeAttemptForDurableDispatch({
            ...accepted,
            provider_requests_started: 0,
            provider_requests_completed: 0,
            live_spend: 0,
            known_spend_observed: 1,
        });
        assert.equal(zeroRequestKnownSpend.state, 'unknown');
        assert.equal(zeroRequestKnownSpend.retry_allowed, false);
        assert.equal(classifyForgeAttemptForDurableDispatch({
            ...accepted,
            provider_requests_started: 1,
            provider_requests_completed: 1,
            live_spend: 0,
            known_spend_observed: 1,
        }).state, 'accepted');
        const malformedAccounting = [
            { name: 'completed exceeds started', provider_requests_started: 1, provider_requests_completed: 2 },
            { name: 'negative count', provider_requests_completed: -1 },
            { name: 'fractional count', provider_requests_ambiguous: 0.5 },
            { name: 'overflow count', provider_requests_started: 7 },
            { name: 'incomplete terminal accounting', provider_requests_completed: 5 },
        ];
        for (const { name, ...accounting } of malformedAccounting) {
            const malformed = classifyForgeAttemptForDurableDispatch({ ...accepted, ...accounting });
            assert.equal(malformed.state, 'unknown', name);
            assert.equal(malformed.retry_allowed, false, name);
        }
    });
});
