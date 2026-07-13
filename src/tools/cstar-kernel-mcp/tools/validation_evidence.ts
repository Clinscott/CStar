import { createHash } from 'node:crypto';
import path from 'node:path';

import { readBoundedUtf8FileInside } from '../contracts/runtime.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';

const MAX_VALIDATION_EVIDENCE_BYTES = 4 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface ValidationEvidencePayload {
    validator_identity: string;
    independent_of_execution: boolean;
    artifacts: Array<{ path: string; sha256: string }>;
    checks: Array<{
        name: string;
        status: 'pass' | 'fail';
        evidence_path: string;
        sha256: string;
    }>;
}

export interface VerifiedValidationEvidence {
    validator_identity: string;
    validator_identity_source: 'codex_request_meta' | 'direct_stdio_thread' | 'test_fixture';
    request_thread_id?: string;
    request_turn_id?: string;
    session_turn_record_sha256?: string;
    session_turn_record_set_sha256?: string;
    session_turn_record_count?: number;
    session_turn_first_timestamp?: string;
    session_turn_timestamp?: string;
    evidence_sha256: string;
    artifact_paths: string[];
    artifact_hashes: string[];
    check_count: number;
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableJson(item))));
    if (value && typeof value === 'object') {
        const normalized = Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, JSON.parse(stableJson(item))]),
        );
        return JSON.stringify(normalized);
    }
    return JSON.stringify(value);
}

function verifyFile(root: string, candidate: string, expectedSha256: string): { path: string; sha256: string } {
    const normalizedHash = expectedSha256.trim().toLowerCase();
    if (!SHA256_PATTERN.test(normalizedHash)) throw new Error(`validation_evidence_sha256_invalid:${candidate}`);
    const file = readBoundedUtf8FileInside(root, candidate, MAX_VALIDATION_EVIDENCE_BYTES);
    const actual = createHash('sha256').update(file.content, 'utf-8').digest('hex');
    if (actual !== normalizedHash) throw new Error(`validation_evidence_sha256_mismatch:${candidate}`);
    return { path: path.resolve(file.path), sha256: actual };
}

export async function verifyValidationEvidence(
    root: string,
    payload: ValidationEvidencePayload | undefined,
    context?: McpRequestContext,
): Promise<VerifiedValidationEvidence | null> {
    if (!payload) return null;
    const reportedValidatorIdentity = payload.validator_identity?.trim();
    if (!reportedValidatorIdentity || reportedValidatorIdentity.length > 240) {
        throw new Error('validation_evidence_validator_identity_invalid');
    }
    if (payload.independent_of_execution !== true) {
        throw new Error('validation_evidence_independence_required');
    }
    if (!Array.isArray(payload.artifacts) || payload.artifacts.length === 0 || payload.artifacts.length > 50) {
        throw new Error('validation_evidence_artifacts_required');
    }
    if (!Array.isArray(payload.checks) || payload.checks.length === 0 || payload.checks.length > 25) {
        throw new Error('validation_evidence_checks_required');
    }

    const callerThreadId = process.env.CSTAR_MCP_CALLER_THREAD_ID?.trim();
    const callerTransport = process.env.CSTAR_MCP_CALLER_TRANSPORT?.trim();
    const testFixture = Boolean(process.env.NODE_TEST_CONTEXT) && process.env.CSTAR_FORGE_TEST_MODE === '1';
    if (!testFixture && callerTransport !== 'direct-stdio') {
        throw new Error('validation_evidence_requires_direct_stdio_transport');
    }
    const requestIdentity = !testFixture && context
        ? await verifyCodexRequestIdentity(context)
        : null;
    if (!testFixture && !requestIdentity && !/^[0-9a-f-]{36}$/i.test(callerThreadId ?? '')) {
        throw new Error('validation_evidence_requires_bound_direct_stdio_request');
    }
    if (requestIdentity && callerThreadId && callerThreadId !== requestIdentity.thread_id) {
        throw new Error('validation_evidence_request_identity_mismatch');
    }
    const validatorIdentity = testFixture
        ? reportedValidatorIdentity
        : requestIdentity
            ? `codex-thread:${requestIdentity.thread_id}:turn:${requestIdentity.turn_id}`
            : `codex-thread:${callerThreadId}`;
    const identitySource = testFixture
        ? 'test_fixture'
        : requestIdentity ? 'codex_request_meta' : 'direct_stdio_thread';

    const artifacts = payload.artifacts.map((entry) => verifyFile(root, entry.path, entry.sha256));
    const checks = payload.checks.map((entry) => {
        if (!entry.name?.trim() || entry.name.length > 240) throw new Error('validation_evidence_check_name_invalid');
        if (entry.status !== 'pass') throw new Error(`validation_evidence_check_not_passed:${entry.name}`);
        return {
            name: entry.name.trim(),
            status: entry.status,
            evidence: verifyFile(root, entry.evidence_path, entry.sha256),
        };
    });
    const canonical = {
        validator_identity: validatorIdentity,
        validator_identity_source: identitySource,
        ...(requestIdentity ? {
            request_thread_id: requestIdentity.thread_id,
            request_turn_id: requestIdentity.turn_id,
            session_turn_record_sha256: requestIdentity.turn_record_sha256,
            session_turn_record_set_sha256: requestIdentity.turn_record_set_sha256,
            session_turn_record_count: requestIdentity.turn_record_count,
            session_turn_first_timestamp: requestIdentity.turn_first_timestamp,
            session_turn_timestamp: requestIdentity.turn_timestamp,
        } : {}),
        independent_of_execution: true,
        artifacts: artifacts.slice().sort((left, right) => left.path.localeCompare(right.path)),
        checks: checks.slice().sort((left, right) => left.name.localeCompare(right.name)),
    };
    return {
        validator_identity: validatorIdentity,
        validator_identity_source: identitySource,
        request_thread_id: requestIdentity?.thread_id,
        request_turn_id: requestIdentity?.turn_id,
        session_turn_record_sha256: requestIdentity?.turn_record_sha256,
        session_turn_record_set_sha256: requestIdentity?.turn_record_set_sha256,
        session_turn_record_count: requestIdentity?.turn_record_count,
        session_turn_first_timestamp: requestIdentity?.turn_first_timestamp,
        session_turn_timestamp: requestIdentity?.turn_timestamp,
        evidence_sha256: createHash('sha256').update(stableJson(canonical), 'utf-8').digest('hex'),
        artifact_paths: artifacts.map((entry) => entry.path),
        artifact_hashes: artifacts.map((entry) => entry.sha256),
        check_count: checks.length,
    };
}
