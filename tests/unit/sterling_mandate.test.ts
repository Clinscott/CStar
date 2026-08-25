import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { verifySterlingMandate, type MandateEvidence } from '../../src/node/core/sterling_mandate.js';
import { database } from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import type {
    HallBeadRecord,
    HallValidationEvidenceManifest,
    HallValidationEvidenceManifestV3,
    HallValidationRun,
} from '../../src/types/hall.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';
import { hashValidationEvidenceManifest } from '../../src/types/validation_evidence.js';
import {
    authorizeForgeRequest,
    saveForgeRequest,
} from '../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import {
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    recordForgeDelivery,
    resolveForgeValidationSubject,
} from '../../src/tools/pennyone/intel/forge_validation_controller.js';

function sha256(filePath: string): string {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFile(root: string, relative: string, content: string): string {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, 'utf-8');
    return absolute;
}

describe('Sterling independent validation authority boundary', () => {
    let root: string;
    let previousRoot: string;
    let repoId: string;
    let bead: HallBeadRecord;
    let lorePath: string;
    let isolationPath: string;
    let checkPath: string;
    let now: number;
    let previousNodeTestContext: string | undefined;

    beforeEach(() => {
        previousRoot = registry.getRoot();
        root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-sterling-authority-'));
        previousNodeTestContext = process.env.NODE_TEST_CONTEXT;
        process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
        registry.setRoot(root);
        database.close();
        database.getWritableDb(root);
        repoId = buildHallRepositoryId(normalizeHallPath(root));
        now = Date.now();
        bead = {
            bead_id: 'bead:synthetic:sterling',
            repo_id: repoId,
            target_kind: 'VALIDATION',
            rationale: 'Synthetic Sterling authority fixture.',
            status: 'READY_FOR_REVIEW',
            created_at: now - 1_000,
            updated_at: now - 500,
        };
        database.upsertHallBead(bead);
        lorePath = writeFile(root, 'tests/features/sterling.feature', [
            'Feature: Sterling authority',
            '  Scenario: exact receipt',
            '    Given bounded evidence',
            '    When resolution is requested',
            '    Then authority is verified',
            '',
        ].join('\n'));
        isolationPath = writeFile(root, 'tests/unit/sterling.test.ts', 'export const focused = true;\n');
        checkPath = writeFile(root, 'work/evidence/sterling-check.txt', 'focused tests passed\n');
    });

    afterEach(() => {
        database.close();
        registry.setRoot(previousRoot);
        if (previousNodeTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
        else process.env.NODE_TEST_CONTEXT = previousNodeTestContext;
        fs.rmSync(root, { recursive: true, force: true });
    });

    function evidence(validationId = 'validation:synthetic:sterling'): MandateEvidence {
        return {
            lore_paths: ['tests/features/sterling.feature'],
            isolation_paths: ['tests/unit/sterling.test.ts'],
            audit: { validation_id: validationId },
        };
    }

    function validationManifest(artifactPaths: string[]): HallValidationEvidenceManifest {
        const db = database.getWritableDb(root);
        const suffix = randomUUID().replaceAll('-', '');
        const requesterThreadId = randomUUID();
        const executorThreadId = randomUUID();
        const requestId = `dispatch-forge-${suffix}`;
        const requestSha = sha256(checkPath);
        saveForgeRequest(db, {
            request_id: requestId,
            repo_id: repoId,
            bead_id: bead.bead_id,
            decision_id: `decision-${suffix}`,
            request_sha256: requestSha,
            request_summary_json: JSON.stringify({
                schema: 'cstar.forge_request.v3',
                required_output_paths: [],
            }),
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            write_capability: 'response_only',
            target_paths_sha256: 'e'.repeat(64),
            live_source_allowed: false,
            max_attempts: 1,
            requester_thread_id: requesterThreadId,
            requester_turn_id: randomUUID(),
            requester_record_set_sha256: 'c'.repeat(64),
            authorization_profile: 'exact_request_challenge_v1',
            authorization_challenge_sha256: 'f'.repeat(64),
            now,
        });
        const authorization = authorizeForgeRequest(db, {
            request_id: requestId,
            request_sha256: requestSha,
            authorization_profile: 'exact_request_challenge_v1',
            challenge_sha256: 'f'.repeat(64),
            operator_authorization_ref: `test:${suffix}`,
            operator_thread_id: executorThreadId,
            operator_turn_id: randomUUID(),
            operator_message_sha256: 'a'.repeat(64),
            operator_record_sha256: 'b'.repeat(64),
            operator_record_set_sha256: 'd'.repeat(64),
            operator_record_count: 1,
            authorized_at: now,
            expires_at: now + 60_000,
            now,
        }).authorization;
        const attempt = reserveForgeAttempt(db, {
            request_id: requestId,
            authorization_id: authorization.authorization_id,
            idempotency_key: `sterling-${suffix}`,
            execution_receipt_id: `forge-execute-${suffix}`,
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            adapter_version: 'synthetic-v2',
            now,
        }).attempt;
        markForgeAttemptStarted(db, attempt.attempt_id, now);
        const deliveryPath = writeFile(root, `work/evidence/delivery-${suffix}.json`, '{"status":"pass"}\n');
        recordForgeDelivery(db, {
            attempt_id: attempt.attempt_id,
            result_status: 'synthetic-delivery',
            result_artifact_sha256: sha256(deliveryPath),
            external_execution_id: `external-${suffix}`,
            adapter_version: 'synthetic-v2',
            now,
        });
        const subject = resolveForgeValidationSubject(db, {
            execution_receipt_id: attempt.execution_receipt_id,
            repository_id: repoId,
            bead_id: bead.bead_id,
        }).subject;
        const validatorThreadId = 'test-independent-validator-thread';
        const validatorTurnId = 'test-independent-validator-turn';
        return {
            schema: 'cstar.validation-evidence.v2',
            validator_identity: `codex-thread:${validatorThreadId}:turn:${validatorTurnId}`,
            validator_identity_source: 'test_fixture',
            request_thread_id: validatorThreadId,
            request_turn_id: validatorTurnId,
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
                validator_thread_id: validatorThreadId,
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
            artifacts: [...artifactPaths, deliveryPath].map((artifactPath) => ({
                path: artifactPath,
                sha256: sha256(artifactPath),
            })),
            checks: [{
                name: 'focused synthetic validation',
                status: 'pass',
                evidence_path: checkPath,
                sha256: sha256(checkPath),
            }],
        };
    }

    function saveVerifiedValidation(overrides: Partial<HallValidationRun> = {}): HallValidationRun {
        const manifest = validationManifest([lorePath, isolationPath]);
        const record: HallValidationRun = {
            validation_id: 'validation:synthetic:sterling',
            repo_id: repoId,
            bead_id: bead.bead_id,
            verdict: 'ACCEPTED',
            authority_class: 'verified_v2',
            validator_identity: manifest.validator_identity,
            validator_identity_source: manifest.validator_identity_source,
            evidence_manifest: manifest,
            evidence_sha256: hashValidationEvidenceManifest(manifest),
            created_at: now,
            ...overrides,
        };
        database.saveValidationRun(record);
        return record;
    }

    function saveHostVerifiedValidation(evidenceRoot = root): { record: HallValidationRun; receiptPath: string } {
        const receiptPath = writeFile(
            evidenceRoot,
            'work/evidence/host-validation-manifest.json',
            '{"status":"pass"}\n',
        );
        const receiptSha = sha256(receiptPath);
        const validatorThreadId = 'test-host-validator-thread';
        const validatorTurnId = 'test-host-validator-turn';
        const manifest: HallValidationEvidenceManifestV3 = {
            schema: 'cstar.validation-evidence.v3',
            validator_identity: `codex-subagent:${validatorThreadId}:turn:${validatorTurnId}`,
            validator_identity_source: 'test_fixture',
            request_thread_id: 'test-recorder-thread',
            request_turn_id: 'test-recorder-turn',
            subject: {
                repository_id: repoId,
                bead_id: bead.bead_id,
                target_path: bead.target_path ?? null,
                work_receipt_kind: 'host_validation_manifest',
                work_receipt_id: `host-validation:${receiptSha}`,
                validation_id: 'validation:synthetic:sterling',
                validation_manifest_schema: 'cstar.independent_validation_input.v1',
                validation_manifest_path: receiptPath,
                validation_manifest_sha256: receiptSha,
            },
            independence: {
                policy: 'depth_one_codex_subagent_from_recording_root_v1',
                recorder_thread_id: 'test-recorder-thread',
                recorder_turn_id: 'test-recorder-turn',
                recorder_record_set_sha256: 'a'.repeat(64),
                validator_thread_id: validatorThreadId,
                validator_turn_id: validatorTurnId,
                validator_parent_thread_id: 'test-recorder-thread',
                validator_agent_path: '/root/validator',
                validator_session_sha256: 'b'.repeat(64),
                validator_final_record_sha256: 'c'.repeat(64),
                validator_task_complete_record_sha256: 'd'.repeat(64),
                validator_completed_at: now,
            },
            artifacts: [lorePath, isolationPath].map((artifactPath) => ({
                path: artifactPath,
                sha256: sha256(artifactPath),
            })),
            checks: [{
                name: 'focused host validation',
                status: 'pass',
                evidence_path: checkPath,
                sha256: sha256(checkPath),
            }],
        };
        const record: HallValidationRun = {
            validation_id: 'validation:synthetic:sterling',
            repo_id: repoId,
            bead_id: bead.bead_id,
            verdict: 'ACCEPTED',
            authority_class: 'verified_v3',
            validator_identity: manifest.validator_identity,
            validator_identity_source: manifest.validator_identity_source,
            evidence_manifest: manifest,
            evidence_sha256: hashValidationEvidenceManifest(manifest),
            created_at: now,
        };
        database.saveValidationRun(record);
        return { record, receiptPath };
    }

    it('accepts only fresh contained Lore and Isolation bound to the exact verified receipt', () => {
        saveVerifiedValidation();
        const verdict = verifySterlingMandate(bead, evidence(), root, now + 1);
        assert.equal(verdict.verdict, 'ACCEPTED');
        assert.ok(verdict.legs.every((leg) => leg.status === 'satisfied'));
    });

    it('accepts a kernel-shaped host-workflow v3 receipt', () => {
        saveHostVerifiedValidation();
        const verdict = verifySterlingMandate(bead, evidence(), root, now + 1);
        assert.equal(verdict.verdict, 'ACCEPTED');
        assert.ok(verdict.legs.every((leg) => leg.status === 'satisfied'));
    });

    it('reads v3 host evidence from a separated code root while Hall remains in the control root', () => {
        const codeRoot = fs.mkdtempSync(path.join(
            process.platform === 'linux' ? '/tmp' : os.tmpdir(),
            'cstar-sterling-code-root-',
        ));
        const originalPaths = { lorePath, isolationPath, checkPath };
        try {
            lorePath = writeFile(
                codeRoot,
                'tests/features/sterling.feature',
                fs.readFileSync(originalPaths.lorePath, 'utf-8'),
            );
            isolationPath = writeFile(
                codeRoot,
                'tests/unit/sterling.test.ts',
                fs.readFileSync(originalPaths.isolationPath, 'utf-8'),
            );
            checkPath = writeFile(
                codeRoot,
                'work/evidence/sterling-check.txt',
                fs.readFileSync(originalPaths.checkPath, 'utf-8'),
            );
            saveHostVerifiedValidation(codeRoot);
            assert.equal(
                verifySterlingMandate(bead, evidence(), root, now + 1).verdict,
                'REJECTED',
            );
            assert.equal(
                verifySterlingMandate(bead, evidence(), root, now + 1, codeRoot).verdict,
                'ACCEPTED',
            );
        } finally {
            ({ lorePath, isolationPath, checkPath } = originalPaths);
            fs.rmSync(codeRoot, { recursive: true, force: true });
        }
    });

    it('rejects host-workflow target drift and a changed validator manifest', () => {
        const { receiptPath } = saveHostVerifiedValidation();
        assert.equal(
            verifySterlingMandate({ ...bead, target_path: 'other' }, evidence(), root, now + 1).verdict,
            'REJECTED',
        );
        fs.writeFileSync(receiptPath, '{"status":"changed"}\n', 'utf-8');
        assert.equal(verifySterlingMandate(bead, evidence(), root, now + 1).verdict, 'REJECTED');
    });

    it('rejects caller scalar scores, claimed Wardens, exemptions, and force-like evidence', () => {
        saveVerifiedValidation();
        for (const hostile of [
            { ...evidence(), audit: { gungnir_score: 100 } },
            { ...evidence(), audit: { warden_results: [{ name: 'claimed', verdict: 'ACCEPTED' }] } },
            { mandate_exempt: true, exemption_reason: 'caller says so' },
            { force: true, force_reason: 'caller says so' },
        ] as unknown as MandateEvidence[]) {
            assert.equal(verifySterlingMandate(bead, hostile, root, now + 1).verdict, 'REJECTED');
        }
    });

    it('rejects absolute, traversal, symlinked, and hardlinked caller artifact paths', () => {
        saveVerifiedValidation();
        const outside = writeFile(path.dirname(root), `${path.basename(root)}-outside.feature`, 'Feature: outside\n');
        const symlink = path.join(root, 'tests', 'features', 'link.feature');
        const hardlink = path.join(root, 'tests', 'features', 'hard.feature');
        fs.symlinkSync(outside, symlink);
        fs.linkSync(lorePath, hardlink);
        try {
            for (const candidate of [outside, '../outside.feature', 'tests/features/link.feature', 'tests/features/hard.feature']) {
                const hostile = { ...evidence(), lore_paths: [candidate] };
                assert.equal(verifySterlingMandate(bead, hostile, root, now + 1).verdict, 'REJECTED');
            }
        } finally {
            fs.rmSync(outside, { force: true });
        }
    });

    it('rejects receipts for another bead, repository, or non-independent authority class', () => {
        saveVerifiedValidation();
        assert.equal(
            verifySterlingMandate({ ...bead, bead_id: 'bead:other' }, evidence(), root, now + 1).verdict,
            'REJECTED',
        );
        assert.equal(
            verifySterlingMandate({ ...bead, repo_id: 'repo:other' }, evidence(), root, now + 1).verdict,
            'REJECTED',
        );
        database.close();
        fs.rmSync(path.join(root, '.stats'), { recursive: true, force: true });
        database.getWritableDb(root);
        database.upsertHallBead(bead);
        const reported: HallValidationRun = {
            validation_id: 'validation:reported',
            repo_id: repoId,
            bead_id: bead.bead_id,
            verdict: 'INCONCLUSIVE',
            authority_class: 'reported',
            created_at: now,
        };
        database.saveValidationRun(reported);
        assert.equal(
            verifySterlingMandate(bead, evidence('validation:reported'), root, now + 1).verdict,
            'REJECTED',
        );
    });

    it('rejects stale evidence and any artifact changed after validation', () => {
        saveVerifiedValidation({ created_at: bead.created_at - 1 });
        assert.equal(verifySterlingMandate(bead, evidence(), root, now + 1).verdict, 'REJECTED');
        database.close();
        fs.rmSync(path.join(root, '.stats'), { recursive: true, force: true });
        database.getWritableDb(root);
        database.upsertHallBead(bead);
        saveVerifiedValidation();
        fs.writeFileSync(isolationPath, 'export const focused = false;\n', 'utf-8');
        assert.equal(verifySterlingMandate(bead, evidence(), root, now + 1).verdict, 'REJECTED');
    });

    it('rejects a valid receipt that did not bind the declared Lore and Isolation files', () => {
        const other = writeFile(root, 'work/evidence/other.txt', 'other artifact\n');
        const manifest = validationManifest([other]);
        database.saveValidationRun({
            validation_id: 'validation:synthetic:sterling',
            repo_id: repoId,
            bead_id: bead.bead_id,
            verdict: 'ACCEPTED',
            authority_class: 'verified_v2',
            validator_identity: manifest.validator_identity,
            validator_identity_source: manifest.validator_identity_source,
            evidence_manifest: manifest,
            evidence_sha256: hashValidationEvidenceManifest(manifest),
            created_at: now,
        });
        assert.equal(verifySterlingMandate(bead, evidence(), root, now + 1).verdict, 'REJECTED');
    });

    it('ignores cached mandate metadata and requires fresh call-site evidence', () => {
        saveVerifiedValidation();
        const cached = {
            ...bead,
            metadata: { mandate_evidence: evidence() },
        };
        assert.equal(verifySterlingMandate(cached, undefined, root, now + 1).verdict, 'REJECTED');
    });

    it('rejects non-Gherkin Lore even when a receipt binds its bytes', () => {
        fs.writeFileSync(lorePath, 'plain prose\n', 'utf-8');
        saveVerifiedValidation();
        assert.equal(verifySterlingMandate(bead, evidence(), root, now + 1).verdict, 'REJECTED');
    });
});
