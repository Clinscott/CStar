import { createHash } from 'node:crypto';
import path from 'node:path';

import type { HallValidationEvidenceManifestV3 } from '../../../types/validation_evidence.js';
import {
    hashValidationEvidenceManifest,
    VALIDATION_EVIDENCE_SHA256,
} from '../../../types/validation_evidence.js';
import {
    readBoundedUtf8FileInside,
    resolveExistingRelativePathInside,
} from '../contracts/runtime.js';
import {
    scanFixedCodexSession,
    type FixedCodexSessionRecord,
} from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';
import {
    markKernelVerifiedValidationEvidence,
    type ValidationEvidencePayload,
    type VerifiedValidationEvidence,
} from './validation_evidence.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPLICIT_VALIDATOR_AGENT_PATH = /^\/root\/[a-z0-9_]+$/;
const DEFAULT_HOST_VALIDATOR_AGENT_PATH = '/root/validator';
const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;
const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_VALIDATOR_FINAL_BYTES = 256 * 1024;

export interface HostValidationReceiptInput {
    validator_thread_id: string;
    validator_turn_id: string;
    manifest_path: string;
    manifest_sha256: string;
}

export interface HostValidationSubject {
    repository_id: string;
    bead_id: string;
    target_path: string | null;
    validation_id: string;
    verdict: string;
}

interface IndependentValidationInput {
    schema: 'cstar.independent_validation_input.v1';
    bead_id: string;
    validation_id: string;
    reported_verdict: string;
    artifacts: Array<{ path: string; sha256: string; bytes?: number }>;
    checks: Array<{
        name: string;
        status: 'pass' | 'fail';
        evidence_path: string;
        sha256: string;
    }>;
}

interface ValidatorSessionReceipt {
    agentPath: string;
    sessionSha256: string;
    finalRecordSha256: string;
    taskCompleteRecordSha256: string;
    completedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validatorAgentPath(
    payload: Record<string, unknown>,
    spawn: Record<string, unknown> | undefined,
): string | null {
    if (!spawn) return null;
    const payloadHasPath = Object.prototype.hasOwnProperty.call(payload, 'agent_path');
    const spawnHasPath = Object.prototype.hasOwnProperty.call(spawn, 'agent_path');
    if (!payloadHasPath && spawnHasPath && spawn.agent_path === null) {
        // Current default-host metadata omits role paths. This fixed label is informational only.
        return DEFAULT_HOST_VALIDATOR_AGENT_PATH;
    }
    if (!payloadHasPath || !spawnHasPath
        || typeof payload.agent_path !== 'string'
        || spawn.agent_path !== payload.agent_path
        || !EXPLICIT_VALIDATOR_AGENT_PATH.test(payload.agent_path)) {
        return null;
    }
    return payload.agent_path;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function evidencePath(root: string, candidate: string): string {
    return path.isAbsolute(candidate)
        ? candidate : resolveExistingRelativePathInside(root, candidate, 'file');
}

function exactIdentifier(text: string, identifier: string): boolean {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}_:./-])${escaped}($|[^\\p{L}\\p{N}_:./-])`, 'iu').test(text);
}

function outputText(payload: Record<string, unknown>): string | null {
    if (!Array.isArray(payload.content) || payload.content.length === 0) return null;
    const parts = payload.content.map((entry) => (
        isRecord(entry) && entry.type === 'output_text' && typeof entry.text === 'string'
            ? entry.text : null
    ));
    return parts.some((entry) => entry === null) ? null : parts.join('');
}

function verifyValidatorSession(
    rootThreadId: string,
    input: HostValidationReceiptInput,
    subject: HostValidationSubject,
    now: number,
): ValidatorSessionReceipt {
    if (!UUID.test(input.validator_thread_id) || !UUID.test(input.validator_turn_id)) {
        throw new Error('host_validation_validator_identity_invalid');
    }
    if (input.validator_thread_id === rootThreadId) {
        throw new Error('host_validation_validator_not_independent');
    }
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), input.validator_thread_id);
    let primaryMetaCount = 0;
    let agentPath = '';
    let finalText = '';
    let finalRecordIndex = -1;
    let finalRecordSha256 = '';
    let finalTimestamp = Number.NaN;
    let taskCompleteIndex = -1;
    let taskCompleteRecordSha256 = '';
    let completedAt = Number.NaN;
    let laterCompletedTurn = false;
    let laterTurnActivity = false;

    const visit = ({ index, rawLine, row }: FixedCodexSessionRecord): void => {
        const payload = isRecord(row.payload) ? row.payload : undefined;
        if (!payload) return;
        if (row.type === 'session_meta' && payload.id === input.validator_thread_id) {
            primaryMetaCount += 1;
            const source = isRecord(payload.source) ? payload.source : undefined;
            const subagent = source && isRecord(source.subagent) ? source.subagent : undefined;
            const spawn = subagent && isRecord(subagent.thread_spawn)
                ? subagent.thread_spawn : undefined;
            const candidatePath = validatorAgentPath(payload, spawn);
            if (
                index !== 0
                || payload.thread_source !== 'subagent'
                || payload.session_id !== rootThreadId
                || payload.parent_thread_id !== rootThreadId
                || payload.forked_from_id !== rootThreadId
                || spawn?.parent_thread_id !== rootThreadId
                || spawn?.depth !== 1
                || candidatePath === null
            ) {
                throw new Error('host_validation_validator_lineage_invalid');
            }
            agentPath = candidatePath;
            return;
        }
        const metadata = isRecord(payload.internal_chat_message_metadata_passthrough)
            ? payload.internal_chat_message_metadata_passthrough : undefined;
        if (
            row.type === 'response_item'
            && payload.type === 'message'
            && payload.role === 'assistant'
            && payload.phase === 'final_answer'
            && metadata?.turn_id === input.validator_turn_id
        ) {
            if (finalRecordIndex >= 0) throw new Error('host_validation_validator_final_ambiguous');
            const text = outputText(payload);
            if (!text || typeof row.timestamp !== 'string') {
                throw new Error('host_validation_validator_final_invalid');
            }
            if (Buffer.byteLength(text, 'utf-8') > MAX_VALIDATOR_FINAL_BYTES) {
                throw new Error('host_validation_validator_final_size_limit_exceeded');
            }
            finalText = text;
            finalRecordIndex = index;
            finalRecordSha256 = sha256(rawLine);
            finalTimestamp = Date.parse(row.timestamp);
            return;
        }
        if (row.type === 'event_msg' && payload.type === 'task_complete') {
            if (payload.turn_id === input.validator_turn_id) {
                if (taskCompleteIndex >= 0) throw new Error('host_validation_task_complete_ambiguous');
                if (typeof payload.completed_at !== 'number'
                    || typeof payload.last_agent_message !== 'string'
                    || typeof row.timestamp !== 'string') {
                    throw new Error('host_validation_task_complete_invalid');
                }
                taskCompleteIndex = index;
                taskCompleteRecordSha256 = sha256(rawLine);
                completedAt = payload.completed_at * 1000;
                if (payload.last_agent_message !== finalText) {
                    throw new Error('host_validation_task_complete_message_mismatch');
                }
                const eventTimestamp = Date.parse(row.timestamp);
                if (!Number.isFinite(eventTimestamp)
                    || !Number.isFinite(finalTimestamp)
                    || eventTimestamp < finalTimestamp - 1_000
                    || eventTimestamp - finalTimestamp > 60_000
                    || Math.abs(eventTimestamp - completedAt) > 60_000) {
                    throw new Error('host_validation_task_complete_timestamp_invalid');
                }
            } else if (taskCompleteIndex >= 0 && index > taskCompleteIndex) {
                laterCompletedTurn = true;
            }
        }
        const recordTurnId = typeof metadata?.turn_id === 'string'
            ? metadata.turn_id : typeof payload.turn_id === 'string' ? payload.turn_id : null;
        if (taskCompleteIndex >= 0 && index > taskCompleteIndex
            && recordTurnId && recordTurnId !== input.validator_turn_id) {
            laterTurnActivity = true;
        }
    };
    const scan = scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, visit);
    if (primaryMetaCount !== 1 || !agentPath) throw new Error('host_validation_validator_lineage_missing');
    if (finalRecordIndex < 0 || taskCompleteIndex <= finalRecordIndex) {
        throw new Error('host_validation_validator_completion_missing');
    }
    if (laterCompletedTurn || laterTurnActivity) {
        throw new Error('host_validation_validator_turn_not_latest');
    }
    if (!Number.isFinite(finalTimestamp) || !Number.isFinite(completedAt)
        || completedAt < finalTimestamp - 1_000 || completedAt - finalTimestamp > 60_000
        || completedAt > now + 60_000 || now - completedAt > MAX_RECEIPT_AGE_MS) {
        throw new Error('host_validation_validator_receipt_stale_or_future_dated');
    }
    if (!exactIdentifier(finalText, input.manifest_sha256)
        || !exactIdentifier(finalText, subject.validation_id)) {
        throw new Error('host_validation_validator_final_not_bound_to_manifest');
    }
    return {
        agentPath,
        sessionSha256: scan.sha256,
        finalRecordSha256,
        taskCompleteRecordSha256,
        completedAt,
    };
}

function parseManifest(
    root: string,
    input: HostValidationReceiptInput,
    payload: ValidationEvidencePayload,
    subject: HostValidationSubject,
): { manifestPath: string; artifacts: Array<{ path: string; sha256: string }>; checks: HallValidationEvidenceManifestV3['checks'] } {
    const normalizedHash = input.manifest_sha256.trim().toLowerCase();
    if (!VALIDATION_EVIDENCE_SHA256.test(normalizedHash)) {
        throw new Error('host_validation_manifest_sha256_invalid');
    }
    const file = readBoundedUtf8FileInside(
        root, evidencePath(root, input.manifest_path), MAX_EVIDENCE_BYTES,
    );
    if (sha256(file.content) !== normalizedHash) throw new Error('host_validation_manifest_sha256_mismatch');
    let parsed: unknown;
    try { parsed = JSON.parse(file.content); } catch {
        throw new Error('host_validation_manifest_json_invalid');
    }
    if (!isRecord(parsed)
        || parsed.schema !== 'cstar.independent_validation_input.v1'
        || parsed.bead_id !== subject.bead_id
        || parsed.validation_id !== subject.validation_id
        || parsed.reported_verdict !== subject.verdict
        || !Array.isArray(parsed.artifacts)
        || !Array.isArray(parsed.checks)) {
        throw new Error('host_validation_manifest_scope_mismatch');
    }
    const declared = parsed as unknown as IndependentValidationInput;
    const manifestArtifacts = declared.artifacts.map((entry) => ({ path: entry.path, sha256: entry.sha256 }));
    const manifestChecks = declared.checks.map((entry) => ({
        name: entry.name,
        status: entry.status,
        evidence_path: entry.evidence_path,
        sha256: entry.sha256,
    }));
    if (new Set(manifestArtifacts.map((entry) => entry.path)).size !== manifestArtifacts.length
        || new Set(manifestChecks.map((entry) => entry.name)).size !== manifestChecks.length
        || new Set(manifestChecks.map((entry) => entry.evidence_path)).size !== manifestChecks.length) {
        throw new Error('host_validation_manifest_duplicate_evidence');
    }
    if (JSON.stringify(manifestArtifacts) !== JSON.stringify(payload.artifacts)
        || JSON.stringify(manifestChecks) !== JSON.stringify(payload.checks)) {
        throw new Error('host_validation_manifest_evidence_mismatch');
    }
    const artifacts = declared.artifacts.map((entry) => {
        const artifact = readBoundedUtf8FileInside(
            root, evidencePath(root, entry.path), MAX_EVIDENCE_BYTES,
        );
        const actual = sha256(artifact.content);
        if (!VALIDATION_EVIDENCE_SHA256.test(entry.sha256) || actual !== entry.sha256.toLowerCase()) {
            throw new Error('validation_evidence_sha256_mismatch');
        }
        if (entry.bytes !== undefined && entry.bytes !== Buffer.byteLength(artifact.content, 'utf-8')) {
            throw new Error('host_validation_manifest_artifact_size_mismatch');
        }
        return { path: path.resolve(artifact.path), sha256: actual };
    });
    const checks = declared.checks.map((entry) => {
        if (!entry.name?.trim() || entry.name.length > 240 || entry.status !== 'pass') {
            throw new Error('validation_evidence_check_not_passed');
        }
        const evidence = readBoundedUtf8FileInside(
            root, evidencePath(root, entry.evidence_path), MAX_EVIDENCE_BYTES,
        );
        const actual = sha256(evidence.content);
        if (!VALIDATION_EVIDENCE_SHA256.test(entry.sha256) || actual !== entry.sha256.toLowerCase()) {
            throw new Error('validation_evidence_sha256_mismatch');
        }
        return {
            name: entry.name.trim(),
            status: 'pass' as const,
            evidence_path: path.resolve(evidence.path),
            sha256: actual,
        };
    });
    return { manifestPath: path.resolve(file.path), artifacts, checks };
}

export function verifyHostWorkflowValidationEvidence(
    root: string,
    payload: ValidationEvidencePayload | undefined,
    receipt: HostValidationReceiptInput | undefined,
    subject: HostValidationSubject,
    recorder: VerifiedCodexRequestIdentity,
    now = Date.now(),
): VerifiedValidationEvidence | null {
    if (!receipt) return null;
    if (!payload || payload.artifacts.length === 0 || payload.artifacts.length > 50
        || payload.checks.length === 0 || payload.checks.length > 25) {
        throw new Error('host_validation_evidence_required');
    }
    if (process.env.CSTAR_MCP_CALLER_THREAD_ID
        && process.env.CSTAR_MCP_CALLER_THREAD_ID.trim() !== recorder.thread_id) {
        throw new Error('host_validation_recorder_identity_mismatch');
    }
    const testFixture = Boolean(process.env.NODE_TEST_CONTEXT) && process.env.CSTAR_FORGE_TEST_MODE === '1';
    if (!testFixture && process.env.CSTAR_MCP_CALLER_TRANSPORT?.trim() !== 'direct-stdio') {
        throw new Error('host_validation_requires_direct_stdio_transport');
    }
    const parsed = parseManifest(root, receipt, payload, subject);
    const validator = verifyValidatorSession(recorder.thread_id, receipt, subject, now);
    const validatorIdentity = `codex-subagent:${receipt.validator_thread_id}:turn:${receipt.validator_turn_id}`;
    const manifest: HallValidationEvidenceManifestV3 = {
        schema: 'cstar.validation-evidence.v3',
        validator_identity: validatorIdentity,
        validator_identity_source: testFixture ? 'test_fixture' : 'codex_subagent_receipt',
        request_thread_id: recorder.thread_id,
        request_turn_id: recorder.turn_id,
        session_turn_record_sha256: recorder.turn_record_sha256,
        session_turn_record_set_sha256: recorder.turn_record_set_sha256,
        session_turn_record_count: recorder.turn_record_count,
        session_turn_first_timestamp: recorder.turn_first_timestamp,
        session_turn_timestamp: recorder.turn_timestamp,
        subject: {
            repository_id: subject.repository_id,
            bead_id: subject.bead_id,
            target_path: subject.target_path,
            work_receipt_kind: 'host_validation_manifest',
            work_receipt_id: `host-validation:${receipt.manifest_sha256.toLowerCase()}`,
            validation_id: subject.validation_id,
            validation_manifest_schema: 'cstar.independent_validation_input.v1',
            validation_manifest_path: parsed.manifestPath,
            validation_manifest_sha256: receipt.manifest_sha256.toLowerCase(),
        },
        independence: {
            policy: 'depth_one_codex_subagent_from_recording_root_v1',
            recorder_thread_id: recorder.thread_id,
            recorder_turn_id: recorder.turn_id,
            recorder_record_set_sha256: recorder.turn_record_set_sha256,
            validator_thread_id: receipt.validator_thread_id,
            validator_turn_id: receipt.validator_turn_id,
            validator_parent_thread_id: recorder.thread_id,
            validator_agent_path: validator.agentPath,
            validator_session_sha256: validator.sessionSha256,
            validator_final_record_sha256: validator.finalRecordSha256,
            validator_task_complete_record_sha256: validator.taskCompleteRecordSha256,
            validator_completed_at: validator.completedAt,
        },
        artifacts: parsed.artifacts.slice().sort((left, right) => left.path.localeCompare(right.path)),
        checks: parsed.checks.slice().sort((left, right) => left.name.localeCompare(right.name)),
    };
    const verified: VerifiedValidationEvidence = {
        validator_identity: validatorIdentity,
        validator_identity_source: manifest.validator_identity_source,
        request_thread_id: recorder.thread_id,
        request_turn_id: recorder.turn_id,
        session_turn_record_sha256: recorder.turn_record_sha256,
        session_turn_record_set_sha256: recorder.turn_record_set_sha256,
        session_turn_record_count: recorder.turn_record_count,
        session_turn_first_timestamp: recorder.turn_first_timestamp,
        session_turn_timestamp: recorder.turn_timestamp,
        evidence_sha256: hashValidationEvidenceManifest(manifest),
        manifest,
        artifact_paths: parsed.artifacts.map((entry) => entry.path),
        artifact_hashes: parsed.artifacts.map((entry) => entry.sha256),
        check_count: parsed.checks.length,
    };
    markKernelVerifiedValidationEvidence(verified);
    return verified;
}
