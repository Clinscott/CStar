import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import Database from 'better-sqlite3';
import type { HallValidationEvidenceManifestV2 } from '../../../src/types/hall.js';
import { hashValidationEvidenceManifest } from '../../../src/types/validation_evidence.js';

import {
    finalizeForgeAttempt,
    getForgeAttempt,
    getForgeAttemptByIdempotency,
    getForgeRequest,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    finalizeForgeValidation,
    recordForgeDelivery,
    resolveForgeValidationSubject,
} from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';

afterEach(cleanupForgeReceiptFixtures);

function insertVerifiedValidation(
    db: Database.Database,
    input: {
        executionReceiptId: string;
        repositoryId: string;
        beadId: string;
        validationId: string;
        verdict: 'SUCCESS' | 'FAILURE' | 'REJECTED' | 'INCONCLUSIVE' | 'ACCEPTED';
        notes?: string;
    },
): void {
    const subject = resolveForgeValidationSubject(db, {
        execution_receipt_id: input.executionReceiptId,
        repository_id: input.repositoryId,
        bead_id: input.beadId,
    }).subject;
    const validatorThread = `validator-${input.validationId}`;
    const validatorTurn = `turn-${input.validationId}`;
    const artifactSha = subject.result_artifact_sha256 ?? '9'.repeat(64);
    const manifest: HallValidationEvidenceManifestV2 = {
        schema: 'cstar.validation-evidence.v2',
        validator_identity: `codex-thread:${validatorThread}:turn:${validatorTurn}`,
        validator_identity_source: 'test_fixture',
        request_thread_id: validatorThread,
        request_turn_id: validatorTurn,
        subject: {
            repository_id: subject.repository_id,
            bead_id: subject.bead_id,
            work_receipt_kind: subject.work_receipt_kind,
            work_receipt_id: subject.work_receipt_id,
            forge_request_id: subject.forge_request_id,
            forge_request_sha256: subject.forge_request_sha256,
            decision_id: subject.decision_id,
            target_paths_sha256: subject.target_paths_sha256,
            attempt_id: subject.attempt_id,
            result_artifact_sha256: subject.result_artifact_sha256,
            adapter_ref: subject.adapter_ref,
            adapter_version: subject.adapter_version,
            external_execution_id: subject.external_execution_id,
        },
        independence: {
            policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1',
            validator_thread_id: validatorThread,
            requester_thread_id: subject.requester_thread_id,
            requester_turn_id: subject.requester_turn_id,
            requester_record_set_sha256: subject.requester_record_set_sha256,
            executor_binding: 'forge_exact_authorizing_turn_v1',
            authorization_id: subject.authorization_id,
            executor_thread_id: subject.executor_thread_id,
            executor_turn_id: subject.executor_turn_id,
            executor_record_sha256: subject.executor_record_sha256,
            executor_record_set_sha256: subject.executor_record_set_sha256,
            executor_record_count: subject.executor_record_count,
        },
        artifacts: [{ path: `/synthetic/${input.validationId}`, sha256: artifactSha }],
        checks: [{
            name: 'synthetic independent validation',
            status: 'pass',
            evidence_path: `/synthetic/${input.validationId}.check`,
            sha256: '8'.repeat(64),
        }],
    };
    db.prepare(`
        INSERT INTO hall_validation_runs (
            validation_id, repo_id, bead_id, verdict, notes, authority_class,
            evidence_sha256, validator_identity, validator_identity_source,
            evidence_manifest_json, created_at
        ) VALUES (?, ?, ?, ?, ?, 'verified_v2', ?, ?, ?, ?, ?)
    `).run(
        input.validationId,
        input.repositoryId,
        input.beadId,
        input.verdict,
        input.notes ?? '',
        hashValidationEvidenceManifest(manifest),
        manifest.validator_identity,
        manifest.validator_identity_source,
        JSON.stringify(manifest),
        Date.now(),
    );
}

describe('durable CStar Forge attempt receipts', () => {
    it('reserves once and replays the same idempotency key across connections', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:reserve';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const request = forgeRequestInput(fixture.repoId, beadId);
        const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
        const secondConnection = new Database(fixture.dbPath);
        secondConnection.pragma('foreign_keys = ON');
        secondConnection.pragma('busy_timeout = 1000');

        const first = reserveForgeAttempt(fixture.db, {
            request_id: request.request_id,
            authorization_id: authorization.authorization_id,
            idempotency_key: 'stable-key',
            execution_receipt_id: 'stable-receipt',
            adapter_ref: request.adapter_ref!,
        });
        const replay = reserveForgeAttempt(secondConnection, {
            request_id: request.request_id,
            authorization_id: authorization.authorization_id,
            idempotency_key: 'stable-key',
            execution_receipt_id: 'ignored-on-replay',
            adapter_ref: request.adapter_ref!,
        });

        assert.equal(first.replayed, false);
        assert.deepEqual(
            getForgeAttemptByIdempotency(secondConnection, request.request_id, 'stable-key'),
            first.attempt,
        );
        assert.equal(
            getForgeAttemptByIdempotency(secondConnection, request.request_id, 'missing-key'),
            null,
        );
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.attempt, first.attempt);
        assert.throws(
            () => reserveForgeAttempt(secondConnection, {
                request_id: request.request_id,
                authorization_id: authorization.authorization_id,
                idempotency_key: 'different-key',
                execution_receipt_id: 'different-receipt',
                adapter_ref: request.adapter_ref!,
            }),
            /forge_request_has_unresolved_attempt/,
        );
        secondConnection.close();
        fixture.db.close();
    });

    it('keeps UNKNOWN unresolved and rejects cross-request retry lineage', () => {
        const fixture = createForgeReceiptFixture();
        insertForgeReceiptBead(fixture.db, fixture.repoId, 'bead:test:unknown');
        insertForgeReceiptBead(fixture.db, fixture.repoId, 'bead:test:other');
        const firstRequest = forgeRequestInput(fixture.repoId, 'bead:test:unknown');
        const secondRequest = forgeRequestInput(fixture.repoId, 'bead:test:other');
        const firstAuthorization = saveAndAuthorizeForgeRequest(fixture.db, firstRequest).authorization;
        const secondAuthorization = saveAndAuthorizeForgeRequest(fixture.db, secondRequest).authorization;
        const firstAttempt = reserveForgeAttempt(fixture.db, {
            request_id: firstRequest.request_id,
            authorization_id: firstAuthorization.authorization_id,
            idempotency_key: 'first',
            execution_receipt_id: 'first-receipt',
            adapter_ref: firstRequest.adapter_ref!,
        }).attempt;
        markForgeAttemptStarted(fixture.db, firstAttempt.attempt_id);
        finalizeForgeAttempt(fixture.db, {
            attempt_id: firstAttempt.attempt_id,
            status: 'UNKNOWN',
            error_code: 'simulated_restart_ambiguity',
        });

        assert.equal(getForgeRequest(fixture.db, firstRequest.request_id)?.status, 'AMBIGUOUS');
        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                request_id: firstRequest.request_id,
                authorization_id: firstAuthorization.authorization_id,
                idempotency_key: 'second',
                execution_receipt_id: 'second-receipt',
                adapter_ref: firstRequest.adapter_ref!,
            }),
            /forge_request_not_authorized:AMBIGUOUS/,
        );
        assert.throws(
            () => reserveForgeAttempt(fixture.db, {
                request_id: secondRequest.request_id,
                authorization_id: secondAuthorization.authorization_id,
                idempotency_key: 'cross-request-retry',
                execution_receipt_id: 'cross-request-receipt',
                adapter_ref: secondRequest.adapter_ref!,
                retry_of_attempt_id: firstAttempt.attempt_id,
            }),
            /forge_attempt_retry_parent_invalid/,
        );
        fixture.db.close();
    });

    it('persists a terminal receipt across database close and reopen', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:terminal';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const request = forgeRequestInput(fixture.repoId, beadId);
        const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
        const attempt = reserveForgeAttempt(fixture.db, {
            request_id: request.request_id,
            authorization_id: authorization.authorization_id,
            idempotency_key: 'terminal',
            execution_receipt_id: 'terminal-receipt',
            adapter_ref: request.adapter_ref!,
        }).attempt;
        markForgeAttemptStarted(fixture.db, attempt.attempt_id);
        recordForgeDelivery(fixture.db, {
            attempt_id: attempt.attempt_id,
            external_execution_id: 'hermes-intent-1',
            result_status: 'ok',
            result_artifact_sha256: 'e'.repeat(64),
        });
        fixture.db.close();

        const reopened = new Database(fixture.dbPath);
        reopened.pragma('foreign_keys = ON');
        assert.equal(getForgeAttempt(reopened, attempt.attempt_id)?.status, 'STARTED');
        assert.match(getForgeAttempt(reopened, attempt.attempt_id)?.result_status ?? '', /DELIVERED_PENDING_VALIDATION/);
        insertVerifiedValidation(reopened, {
            executionReceiptId: attempt.execution_receipt_id,
            repositoryId: fixture.repoId,
            beadId,
            validationId: 'val-terminal-reopen',
            verdict: 'SUCCESS',
            notes: 'independent receipt and artifact check passed',
        });
        finalizeForgeValidation(reopened, {
            execution_receipt_id: attempt.execution_receipt_id,
            validation_id: 'val-terminal-reopen',
        });
        assert.equal(getForgeAttempt(reopened, attempt.attempt_id)?.status, 'SUCCEEDED');
        assert.equal(getForgeRequest(reopened, request.request_id)?.status, 'SUCCEEDED');
        assert.equal(getForgeAttempt(reopened, attempt.attempt_id)?.result_artifact_sha256, 'e'.repeat(64));
        reopened.close();
    });

    it('does not reopen a legacy unvalidated success through a new receipt', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:legacy-correction';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const request = forgeRequestInput(fixture.repoId, beadId);
        const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
        const attempt = reserveForgeAttempt(fixture.db, {
            request_id: request.request_id,
            authorization_id: authorization.authorization_id,
            idempotency_key: 'legacy',
            execution_receipt_id: 'legacy-receipt',
            adapter_ref: request.adapter_ref!,
        }).attempt;
        markForgeAttemptStarted(fixture.db, attempt.attempt_id);
        finalizeForgeAttempt(fixture.db, { attempt_id: attempt.attempt_id, status: 'SUCCEEDED' });

        assert.throws(() => finalizeForgeValidation(fixture.db, {
            execution_receipt_id: attempt.execution_receipt_id,
            validation_id: 'val-legacy-missing-receipt',
        }), /forge_validation_receipt_not_found/);
        assert.equal(getForgeAttempt(fixture.db, attempt.attempt_id)?.status, 'SUCCEEDED');

        insertVerifiedValidation(fixture.db, {
            executionReceiptId: attempt.execution_receipt_id,
            repositoryId: fixture.repoId,
            beadId,
            validationId: 'val-legacy-v2-rejection',
            verdict: 'FAILURE',
        });
        assert.throws(() => finalizeForgeValidation(fixture.db, {
            execution_receipt_id: attempt.execution_receipt_id,
            validation_id: 'val-legacy-v2-rejection',
        }), /forge_execution_not_awaiting_validation:SUCCEEDED/);
        assert.equal(getForgeAttempt(fixture.db, attempt.attempt_id)?.status, 'SUCCEEDED');
        fixture.db.close();
    });

    it('links verified terminal evidence without changing execution state', () => {
        for (const [status, verdict, expectedAccepted] of [
            ['FAILED_FINAL', 'REJECTED', false],
            ['UNKNOWN', 'INCONCLUSIVE', null],
        ] as const) {
            const fixture = createForgeReceiptFixture();
            const beadId = `bead:test:terminal-link:${status}`;
            insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
            const request = forgeRequestInput(fixture.repoId, beadId);
            const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
            const attempt = reserveForgeAttempt(fixture.db, {
                request_id: request.request_id,
                authorization_id: authorization.authorization_id,
                idempotency_key: `terminal-link-${status}`,
                execution_receipt_id: `terminal-link-receipt-${status}`,
                adapter_ref: request.adapter_ref!,
            }).attempt;
            markForgeAttemptStarted(fixture.db, attempt.attempt_id);
            finalizeForgeAttempt(fixture.db, {
                attempt_id: attempt.attempt_id,
                status,
                result_status: `synthetic-${status}`,
                error_code: `synthetic-${status.toLowerCase()}`,
            });
            const beforeAttempt = getForgeAttempt(fixture.db, attempt.attempt_id)!;
            const beforeRequest = getForgeRequest(fixture.db, request.request_id)!;
            const validationId = `val-terminal-link-${status}`;
            insertVerifiedValidation(fixture.db, {
                executionReceiptId: attempt.execution_receipt_id,
                repositoryId: fixture.repoId,
                beadId,
                validationId,
                verdict,
                notes: 'Independent synthetic terminal evidence.',
            });
            const input = {
                execution_receipt_id: attempt.execution_receipt_id,
                validation_id: validationId,
            };

            const linked = finalizeForgeValidation(fixture.db, input);

            assert.equal(linked.mode, 'terminal_evidence_link');
            assert.equal(linked.execution_status_changed, false);
            assert.equal(linked.accepted, expectedAccepted);
            assert.equal(linked.attempt.status, beforeAttempt.status);
            assert.equal(linked.attempt.result_status, beforeAttempt.result_status);
            assert.equal(linked.attempt.error_code, beforeAttempt.error_code);
            assert.equal(linked.request.status, beforeRequest.status);
            assert.equal(linked.request.active_attempt_id, beforeRequest.active_attempt_id);
            assert.equal(linked.request.completed_at, beforeRequest.completed_at);
            assert.equal(linked.attempt.validation_id, input.validation_id);
            assert.equal(finalizeForgeValidation(fixture.db, input).mode, 'terminal_evidence_link');
            insertVerifiedValidation(fixture.db, {
                executionReceiptId: attempt.execution_receipt_id,
                repositoryId: fixture.repoId,
                beadId,
                validationId: `${validationId}-different`,
                verdict,
            });
            assert.throws(
                () => finalizeForgeValidation(fixture.db, {
                    ...input,
                    validation_id: `${validationId}-different`,
                }),
                /forge_execution_already_validated/,
            );
            fixture.db.close();
        }
    });

    it('does not turn positive validation of a failed attempt into delivery success', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:terminal-positive-rejected';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const request = forgeRequestInput(fixture.repoId, beadId);
        const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
        const attempt = reserveForgeAttempt(fixture.db, {
            request_id: request.request_id,
            authorization_id: authorization.authorization_id,
            idempotency_key: 'terminal-positive-rejected',
            execution_receipt_id: 'terminal-positive-rejected-receipt',
            adapter_ref: request.adapter_ref!,
        }).attempt;
        markForgeAttemptStarted(fixture.db, attempt.attempt_id);
        finalizeForgeAttempt(fixture.db, { attempt_id: attempt.attempt_id, status: 'FAILED_FINAL' });

        insertVerifiedValidation(fixture.db, {
            executionReceiptId: attempt.execution_receipt_id,
            repositoryId: fixture.repoId,
            beadId,
            validationId: 'val-terminal-positive-rejected',
            verdict: 'ACCEPTED',
        });
        assert.throws(() => finalizeForgeValidation(fixture.db, {
            execution_receipt_id: attempt.execution_receipt_id,
            validation_id: 'val-terminal-positive-rejected',
        }), /forge_terminal_failure_validation_cannot_accept_delivery/);
        assert.equal(getForgeAttempt(fixture.db, attempt.attempt_id)?.status, 'FAILED_FINAL');
        assert.equal(getForgeAttempt(fixture.db, attempt.attempt_id)?.validation_id, undefined);
        assert.equal(getForgeRequest(fixture.db, request.request_id)?.status, 'FAILED_FINAL');
        fixture.db.close();
    });

    it('cannot replay validation for execution A against execution B', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = 'bead:test:cross-execution-validation';
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        const attempts = ['a', 'b'].map((label) => {
            const request = forgeRequestInput(fixture.repoId, beadId);
            const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
            const attempt = reserveForgeAttempt(fixture.db, {
                request_id: request.request_id,
                authorization_id: authorization.authorization_id,
                idempotency_key: `cross-${label}`,
                execution_receipt_id: `cross-execution-${label}`,
                adapter_ref: request.adapter_ref!,
            }).attempt;
            markForgeAttemptStarted(fixture.db, attempt.attempt_id);
            recordForgeDelivery(fixture.db, {
                attempt_id: attempt.attempt_id,
                result_status: 'ok',
                result_artifact_sha256: '7'.repeat(64),
            });
            return attempt;
        });
        insertVerifiedValidation(fixture.db, {
            executionReceiptId: attempts[0]!.execution_receipt_id,
            repositoryId: fixture.repoId,
            beadId,
            validationId: 'val-execution-a-only',
            verdict: 'SUCCESS',
        });

        assert.throws(() => finalizeForgeValidation(fixture.db, {
            execution_receipt_id: attempts[1]!.execution_receipt_id,
            validation_id: 'val-execution-a-only',
        }), /forge_validation_receipt_subject_mismatch/);
        assert.equal(getForgeAttempt(fixture.db, attempts[1]!.attempt_id)?.status, 'STARTED');
        fixture.db.close();
    });
});
