import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { HallValidationEvidenceManifestV4 } from '../../../types/validation_evidence.js';
import {
    hashValidationEvidenceManifest,
    VALIDATION_EVIDENCE_SHA256,
} from '../../../types/validation_evidence.js';
import { readBoundedUtf8FileInside } from '../contracts/runtime.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';
import {
    markKernelVerifiedValidationEvidence,
    type ValidationEvidencePayload,
    type VerifiedValidationEvidence,
} from './validation_evidence.js';

const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const PASS_RESULTS = new Set(['PASS', 'ACCEPTED', 'PASS_PENDING_INDEPENDENT_VALIDATION']);
const POSITIVE_VERDICTS = new Set(['ACCEPTED', 'SUCCESS']);

export interface HostArtifactValidationReceiptInput {
    controller_receipt_path: string;
    controller_receipt_sha256: string;
    controller_id: string;
    executor_id: string;
    validator_receipt_path: string;
    validator_receipt_sha256: string;
    validator_id: string;
}

export interface HostArtifactValidationSubject {
    repository_id: string;
    bead_id: string;
    target_path: string | null;
    validation_id: string;
    verdict: string;
}

interface EvidenceFile {
    path: string;
    sha256: string;
    content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function allowedRoots(repositoryRoot: string): string[] {
    const receiptRoot = process.env.CSTAR_RECEIPTS_ROOT?.trim()
        || path.join(os.homedir(), 'cstar-receipts');
    return [...new Set([repositoryRoot, receiptRoot].map((entry) => path.resolve(entry)))];
}

function readEvidenceFile(repositoryRoot: string, candidate: string, expected: string): EvidenceFile {
    const normalizedHash = expected.trim().toLowerCase();
    if (!VALIDATION_EVIDENCE_SHA256.test(normalizedHash)) {
        throw new Error('host_artifact_validation_sha256_invalid');
    }
    const resolved = path.resolve(candidate);
    for (const root of allowedRoots(repositoryRoot)) {
        const relative = path.relative(root, resolved);
        if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) continue;
        const file = readBoundedUtf8FileInside(root, resolved, MAX_EVIDENCE_BYTES);
        const actual = createHash('sha256').update(file.content, 'utf-8').digest('hex');
        if (actual !== normalizedHash) throw new Error('host_artifact_validation_sha256_mismatch');
        return { path: path.resolve(file.path), sha256: actual, content: file.content };
    }
    throw new Error('host_artifact_validation_path_outside_allowed_roots');
}

function parseRecord(file: EvidenceFile, error: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(file.content);
        if (isRecord(parsed)) return parsed;
    } catch { /* Return the stable error below. */ }
    throw new Error(error);
}

function protectedEffectsAreZero(value: unknown): boolean {
    if (value === 0) return true;
    if (!isRecord(value)) return false;
    const entries = Object.values(value);
    return entries.length > 0 && entries.every((entry) => entry === 0 || entry === false);
}

function receiptIncluded(
    artifacts: Array<{ path: string; sha256: string }>,
    receipt: EvidenceFile,
): boolean {
    return artifacts.some((entry) => entry.path === receipt.path && entry.sha256 === receipt.sha256);
}

export function verifyHostArtifactValidationEvidence(
    repositoryRoot: string,
    payload: ValidationEvidencePayload | undefined,
    input: HostArtifactValidationReceiptInput,
    subject: HostArtifactValidationSubject,
    requestIdentity: VerifiedCodexRequestIdentity,
): VerifiedValidationEvidence {
    if (!payload?.artifacts?.length || !payload.checks?.length) {
        throw new Error('host_artifact_validation_evidence_required');
    }
    if (!input.controller_id.trim() || !input.executor_id.trim() || !input.validator_id.trim()
        || input.controller_id === input.validator_id || input.executor_id === input.validator_id) {
        throw new Error('host_artifact_validation_independence_invalid');
    }
    const controllerReceipt = readEvidenceFile(
        repositoryRoot, input.controller_receipt_path, input.controller_receipt_sha256,
    );
    const validatorReceipt = readEvidenceFile(
        repositoryRoot, input.validator_receipt_path, input.validator_receipt_sha256,
    );
    const controller = parseRecord(controllerReceipt, 'host_artifact_controller_receipt_invalid');
    const validator = parseRecord(validatorReceipt, 'host_artifact_validator_receipt_invalid');
    const controllerBead = String(controller.bead ?? controller.bead_id ?? '');
    const controllerResult = String(controller.result ?? controller.status ?? controller.verdict ?? '');
    if (controllerBead !== subject.bead_id || !PASS_RESULTS.has(controllerResult)
        || (typeof controller.controller === 'string' && controller.controller !== input.controller_id)) {
        throw new Error('host_artifact_controller_receipt_scope_invalid');
    }
    const validatorVerdict = String(validator.verdict ?? validator.result ?? validator.status ?? '');
    if (validator.validation_id !== subject.validation_id
        || validator.topology !== 'FRESH_OUTSIDE_IMPLEMENTATION_ANCESTRY'
        || !protectedEffectsAreZero(validator.protected_effects)
        || (POSITIVE_VERDICTS.has(subject.verdict) && !POSITIVE_VERDICTS.has(validatorVerdict))) {
        throw new Error('host_artifact_validator_receipt_scope_invalid');
    }
    if (input.validator_id !== subject.validation_id) {
        throw new Error('host_artifact_validator_id_not_bound');
    }
    const artifacts = payload.artifacts.map((entry) => {
        const verified = readEvidenceFile(repositoryRoot, entry.path, entry.sha256);
        return { path: verified.path, sha256: verified.sha256 };
    }).sort((left, right) => left.path.localeCompare(right.path));
    if (!receiptIncluded(artifacts, controllerReceipt) || !receiptIncluded(artifacts, validatorReceipt)) {
        throw new Error('host_artifact_receipts_missing_from_evidence');
    }
    const checks = payload.checks.map((entry) => {
        if (!entry.name?.trim() || entry.name.length > 240 || entry.status !== 'pass') {
            throw new Error('host_artifact_validation_check_not_passed');
        }
        const evidence = readEvidenceFile(repositoryRoot, entry.evidence_path, entry.sha256);
        return { name: entry.name.trim(), status: 'pass' as const, evidence_path: evidence.path, sha256: evidence.sha256 };
    }).sort((left, right) => left.name.localeCompare(right.name));
    const source = process.env.NODE_TEST_CONTEXT ? 'test_fixture' : 'host_artifact_receipt';
    const manifest: HallValidationEvidenceManifestV4 = {
        schema: 'cstar.validation-evidence.v4',
        validator_identity: `host-artifact:${input.validator_id}:${validatorReceipt.sha256}`,
        validator_identity_source: source,
        request_thread_id: requestIdentity.thread_id,
        request_turn_id: requestIdentity.turn_id,
        session_turn_record_sha256: requestIdentity.turn_record_sha256,
        session_turn_record_set_sha256: requestIdentity.turn_record_set_sha256,
        session_turn_record_count: requestIdentity.turn_record_count,
        session_turn_first_timestamp: requestIdentity.turn_first_timestamp,
        session_turn_timestamp: requestIdentity.turn_timestamp,
        subject: {
            repository_id: subject.repository_id,
            bead_id: subject.bead_id,
            target_path: subject.target_path,
            work_receipt_kind: 'host_native_artifact',
            work_receipt_id: `host-work:${controllerReceipt.sha256}`,
            controller_receipt_path: controllerReceipt.path,
            controller_receipt_sha256: controllerReceipt.sha256,
            validation_id: subject.validation_id,
            validator_receipt_path: validatorReceipt.path,
            validator_receipt_sha256: validatorReceipt.sha256,
        },
        independence: {
            policy: 'distinct_host_artifact_validator_v1',
            recorder_thread_id: requestIdentity.thread_id,
            recorder_turn_id: requestIdentity.turn_id,
            recorder_record_set_sha256: requestIdentity.turn_record_set_sha256,
            controller_id: input.controller_id,
            executor_id: input.executor_id,
            validator_id: input.validator_id,
            validator_topology: 'FRESH_OUTSIDE_IMPLEMENTATION_ANCESTRY',
        },
        artifacts,
        checks,
    };
    const verified: VerifiedValidationEvidence = {
        validator_identity: manifest.validator_identity,
        validator_identity_source: source,
        request_thread_id: requestIdentity.thread_id,
        request_turn_id: requestIdentity.turn_id,
        session_turn_record_sha256: requestIdentity.turn_record_sha256,
        session_turn_record_set_sha256: requestIdentity.turn_record_set_sha256,
        session_turn_record_count: requestIdentity.turn_record_count,
        session_turn_first_timestamp: requestIdentity.turn_first_timestamp,
        session_turn_timestamp: requestIdentity.turn_timestamp,
        evidence_sha256: hashValidationEvidenceManifest(manifest),
        manifest,
        artifact_paths: artifacts.map((entry) => entry.path),
        artifact_hashes: artifacts.map((entry) => entry.sha256),
        check_count: checks.length,
    };
    markKernelVerifiedValidationEvidence(verified);
    return verified;
}
