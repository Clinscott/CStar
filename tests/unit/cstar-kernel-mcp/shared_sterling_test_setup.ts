import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
    HallValidationEvidenceManifestV2,
    HallValidationRun,
} from '../../../src/types/hall.js';
import { hashValidationEvidenceManifest } from '../../../src/types/validation_evidence.js';

export const validationStore = new Map<string, HallValidationRun>();
const forgeRequests = new Map<string, Record<string, unknown>>();
const forgeAttempts = new Map<string, Record<string, unknown>>();
const forgeAttemptsByReceipt = new Map<string, Record<string, unknown>>();
const forgeAuthorizations = new Map<string, Record<string, unknown>>();
const generatedEvidencePaths = new Set<string>();

export function lookupSterlingForgeRow(sql: string, key: string): Record<string, unknown> | null {
    if (sql.includes('hall_forge_attempts') && sql.includes('execution_receipt_id')) {
        return forgeAttemptsByReceipt.get(key) ?? null;
    }
    if (sql.includes('hall_forge_attempts')) return forgeAttempts.get(key) ?? null;
    if (sql.includes('hall_forge_requests')) return forgeRequests.get(key) ?? null;
    if (sql.includes('hall_forge_authorizations')) return forgeAuthorizations.get(key) ?? null;
    return null;
}

export function cleanupSterlingValidationArtifacts(): void {
    for (const filePath of generatedEvidencePaths) fs.rmSync(filePath, { force: true });
    generatedEvidencePaths.clear();
    forgeRequests.clear();
    forgeAttempts.clear();
    forgeAttemptsByReceipt.clear();
    forgeAuthorizations.clear();
}

function sha256(filePath: string): string {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function seedSterlingValidationRecord(
    bead: { repo_id: string; created_at?: number },
    beadId: string,
    validationId: string,
    root: string,
): {
    validationId: string;
    mandateEvidence: {
        lore_paths: string[];
        isolation_paths: string[];
        audit: { validation_id: string };
    };
} {
    const suffix = createHash('sha256')
        .update(`${beadId}\0${validationId}\0${randomUUID()}`).digest('hex').slice(0, 12);
    const loreRelative = `tests/features/sterling-${suffix}.feature`;
    const isolationRelative = `tests/unit/sterling-${suffix}.test.ts`;
    const checkRelative = `work/evidence/sterling-${suffix}.txt`;
    const deliveryRelative = `work/evidence/sterling-delivery-${suffix}.json`;
    const write = (relative: string, content: string) => {
        const absolute = path.join(root, relative);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, content, { mode: 0o600 });
        generatedEvidencePaths.add(absolute);
        return absolute;
    };
    const lorePath = write(loreRelative, [
        'Feature: Synthetic Sterling validation',
        '  Scenario: Exact independent receipt',
        '    Given bounded synthetic evidence',
        '    Then bead resolution is verified',
        '',
    ].join('\n'));
    const isolationPath = write(isolationRelative, 'export const focused = true;\n');
    const checkPath = write(checkRelative, 'focused synthetic validation passed\n');
    const deliveryPath = write(deliveryRelative, '{"status":"pass"}\n');
    const requestId = `dispatch-forge-${suffix}`;
    const attemptId = `forge-attempt-${suffix}-1`;
    const executionReceiptId = `forge-execute-${suffix}`;
    const authorizationId = `forge-authorization-${suffix}`;
    const requesterThreadId = `requester-${suffix}`;
    const requesterTurnId = `requester-turn-${suffix}`;
    const executorThreadId = `executor-${suffix}`;
    const executorTurnId = `executor-turn-${suffix}`;
    const now = Math.max(Date.now(), Number(bead.created_at ?? 0));
    const request = {
        request_id: requestId,
        repo_id: bead.repo_id,
        bead_id: beadId,
        decision_id: `decision-${suffix}`,
        request_sha256: 'a'.repeat(64),
        request_summary_json: JSON.stringify({
            schema: 'cstar.forge_request.v3',
            required_output_paths: [],
        }),
        adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        write_capability: 'response_only',
        target_paths_sha256: 'b'.repeat(64),
        live_source_allowed: 0,
        max_attempts: 1,
        status: 'AUTHORIZED',
        requester_thread_id: requesterThreadId,
        requester_turn_id: requesterTurnId,
        requester_record_set_sha256: 'c'.repeat(64),
        authorization_profile: 'exact_request_challenge_v1',
        authorization_binding_sha256: 'd'.repeat(64),
        authorization_challenge_sha256: 'd'.repeat(64),
        operator_authorization_ref: `test:${suffix}`,
        operator_thread_id: executorThreadId,
        operator_turn_id: executorTurnId,
        operator_message_sha256: 'e'.repeat(64),
        operator_record_sha256: 'f'.repeat(64),
        operator_record_set_sha256: '1'.repeat(64),
        operator_record_count: 1,
        authorized_at: now,
        expires_at: now + 60_000,
        created_at: now,
        updated_at: now,
    };
    const authorization = {
        authorization_id: authorizationId,
        request_id: requestId,
        request_sha256: request.request_sha256,
        authorization_profile: 'exact_request_challenge_v1',
        authorization_binding_sha256: request.authorization_binding_sha256,
        challenge_sha256: request.authorization_challenge_sha256,
        operator_authorization_ref: request.operator_authorization_ref,
        operator_thread_id: executorThreadId,
        operator_turn_id: executorTurnId,
        operator_message_sha256: request.operator_message_sha256,
        operator_record_sha256: request.operator_record_sha256,
        operator_record_set_sha256: request.operator_record_set_sha256,
        operator_record_count: 1,
        authorized_at: request.authorized_at,
        expires_at: request.expires_at,
        created_at: now,
    };
    const attempt = {
        attempt_id: attemptId,
        request_id: requestId,
        ordinal: 1,
        idempotency_key: `sterling-${suffix}`,
        execution_receipt_id: executionReceiptId,
        adapter_ref: request.adapter_ref,
        adapter_version: 'synthetic-v2',
        status: 'STARTED',
        external_execution_id: `external-${suffix}`,
        result_status: 'DELIVERED_PENDING_VALIDATION:synthetic',
        result_artifact_sha256: sha256(deliveryPath),
        reserved_at: now,
        updated_at: now,
    };
    forgeRequests.set(requestId, request);
    forgeAuthorizations.set(requestId, authorization);
    forgeAttempts.set(attemptId, attempt);
    forgeAttemptsByReceipt.set(executionReceiptId, attempt);
    const validatorThreadId = `validator-${suffix}`;
    const validatorTurnId = `validator-turn-${suffix}`;
    const manifest: HallValidationEvidenceManifestV2 = {
        schema: 'cstar.validation-evidence.v2',
        validator_identity: `codex-thread:${validatorThreadId}:turn:${validatorTurnId}`,
        validator_identity_source: 'test_fixture',
        request_thread_id: validatorThreadId,
        request_turn_id: validatorTurnId,
        subject: {
            repository_id: bead.repo_id,
            bead_id: beadId,
            work_receipt_kind: 'forge_execution',
            work_receipt_id: executionReceiptId,
            forge_request_id: requestId,
            forge_request_sha256: request.request_sha256,
            decision_id: request.decision_id,
            target_paths_sha256: request.target_paths_sha256,
            attempt_id: attemptId,
            result_artifact_sha256: attempt.result_artifact_sha256,
            adapter_ref: request.adapter_ref,
            adapter_version: attempt.adapter_version,
            external_execution_id: attempt.external_execution_id,
        },
        independence: {
            policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1',
            validator_thread_id: validatorThreadId,
            requester_thread_id: requesterThreadId,
            requester_turn_id: requesterTurnId,
            requester_record_set_sha256: request.requester_record_set_sha256,
            executor_binding: 'forge_exact_authorizing_turn_v1',
            authorization_id: authorizationId,
            executor_thread_id: executorThreadId,
            executor_turn_id: executorTurnId,
            executor_record_sha256: request.operator_record_sha256,
            executor_record_set_sha256: request.operator_record_set_sha256,
            executor_record_count: 1,
        },
        artifacts: [lorePath, isolationPath, deliveryPath].map((artifactPath) => ({
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
    validationStore.set(validationId, {
        validation_id: validationId,
        repo_id: bead.repo_id,
        bead_id: beadId,
        verdict: 'ACCEPTED',
        authority_class: 'verified_v2',
        validator_identity: manifest.validator_identity,
        validator_identity_source: manifest.validator_identity_source,
        evidence_manifest: manifest,
        evidence_sha256: hashValidationEvidenceManifest(manifest),
        created_at: now,
    });
    return {
        validationId,
        mandateEvidence: {
            lore_paths: [loreRelative],
            isolation_paths: [isolationRelative],
            audit: { validation_id: validationId },
        },
    };
}
