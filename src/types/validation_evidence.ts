import { createHash } from 'node:crypto';

export interface HallValidationEvidenceManifestV1 {
    schema: 'cstar.validation-evidence.v1';
    validator_identity: string;
    validator_identity_source: 'codex_request_meta' | 'direct_stdio_thread' | 'test_fixture';
    independent_of_execution: true;
    request_thread_id?: string;
    request_turn_id?: string;
    session_turn_record_sha256?: string;
    session_turn_record_set_sha256?: string;
    session_turn_record_count?: number;
    session_turn_first_timestamp?: string;
    session_turn_timestamp?: string;
    artifacts: Array<{ path: string; sha256: string }>;
    checks: Array<{ name: string; status: 'pass'; evidence_path: string; sha256: string }>;
}

export interface HallValidationEvidenceManifestV2 {
    schema: 'cstar.validation-evidence.v2';
    validator_identity: string;
    validator_identity_source: 'codex_request_meta' | 'test_fixture';
    request_thread_id: string;
    request_turn_id: string;
    session_turn_record_sha256?: string;
    session_turn_record_set_sha256?: string;
    session_turn_record_count?: number;
    session_turn_first_timestamp?: string;
    session_turn_timestamp?: string;
    subject: {
        repository_id: string;
        bead_id: string;
        work_receipt_kind: 'forge_execution';
        work_receipt_id: string;
        forge_request_id: string;
        forge_request_sha256: string;
        decision_id: string;
        target_paths_sha256: string;
        attempt_id: string;
        result_artifact_sha256: string | null;
        adapter_ref: string;
        adapter_version: string | null;
        external_execution_id: string | null;
    };
    independence: {
        policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1';
        validator_thread_id: string;
        requester_thread_id: string;
        requester_turn_id: string;
        requester_record_set_sha256: string;
        executor_binding: 'forge_exact_authorizing_turn_v1';
        authorization_id: string;
        executor_thread_id: string;
        executor_turn_id: string;
        executor_record_sha256: string;
        executor_record_set_sha256: string;
        executor_record_count: number;
    };
    artifacts: Array<{ path: string; sha256: string }>;
    checks: Array<{ name: string; status: 'pass'; evidence_path: string; sha256: string }>;
}

export type HallValidationEvidenceManifest =
    | HallValidationEvidenceManifestV1
    | HallValidationEvidenceManifestV2;

export type CStarValidationVerdict =
    | 'ACCEPTED'
    | 'REJECTED'
    | 'INCONCLUSIVE'
    | 'SUCCESS'
    | 'FAILURE';

export interface CStarValidationRunRecord {
    validation_id: string;
    repo_id: string;
    scan_id?: string;
    bead_id?: string;
    target_path?: string;
    verdict: CStarValidationVerdict;
    sprt_verdict?: string;
    pre_scores?: Record<string, unknown>;
    post_scores?: Record<string, unknown>;
    benchmark?: Record<string, unknown>;
    notes?: string;
    authority_class?: 'reported' | 'verified' | 'verified_v2' | 'internal' | 'legacy_unverified';
    evidence_sha256?: string;
    validator_identity?: string;
    validator_identity_source?: HallValidationEvidenceManifest['validator_identity_source'];
    evidence_manifest?: HallValidationEvidenceManifest;
    created_at: number;
    legacy_trace_id?: number;
}

export const VALIDATION_EVIDENCE_SHA256 = /^[a-f0-9]{64}$/;

export function stableValidationEvidenceJson(value: unknown): string {
    if (Array.isArray(value)) {
        return JSON.stringify(value.map((item) => JSON.parse(stableValidationEvidenceJson(item))));
    }
    if (value && typeof value === 'object') {
        const normalized = Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, JSON.parse(stableValidationEvidenceJson(item))]),
        );
        return JSON.stringify(normalized);
    }
    return JSON.stringify(value);
}

export function hashValidationEvidenceManifest(manifest: HallValidationEvidenceManifest): string {
    return createHash('sha256')
        .update(stableValidationEvidenceJson(manifest), 'utf-8')
        .digest('hex');
}

function nonempty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function nullableNonempty(value: unknown): boolean {
    return value === null || nonempty(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidationEvidenceManifestV2StructurallyValid(
    value: unknown,
): value is HallValidationEvidenceManifestV2 {
    if (!isRecord(value) || !isRecord(value.subject) || !isRecord(value.independence)) {
        return false;
    }
    const manifest = value as unknown as HallValidationEvidenceManifestV2;
    const subject = manifest.subject;
    const independence = manifest.independence;
    const optionalRequestRecordFieldsValid = (
        manifest.session_turn_record_sha256 === undefined
        || VALIDATION_EVIDENCE_SHA256.test(manifest.session_turn_record_sha256)
    ) && (
        manifest.session_turn_record_set_sha256 === undefined
        || VALIDATION_EVIDENCE_SHA256.test(manifest.session_turn_record_set_sha256)
    ) && (
        manifest.session_turn_record_count === undefined
        || manifest.session_turn_record_count === 1
    );
    const requestRecordFieldsValid = manifest.validator_identity_source === 'test_fixture'
        ? optionalRequestRecordFieldsValid
        : VALIDATION_EVIDENCE_SHA256.test(manifest.session_turn_record_sha256 ?? '')
            && VALIDATION_EVIDENCE_SHA256.test(manifest.session_turn_record_set_sha256 ?? '')
            && manifest.session_turn_record_count === 1
            && nonempty(manifest.session_turn_first_timestamp)
            && nonempty(manifest.session_turn_timestamp);
    return manifest.schema === 'cstar.validation-evidence.v2'
        && nonempty(manifest.request_thread_id)
        && nonempty(manifest.request_turn_id)
        && manifest.validator_identity
            === `codex-thread:${manifest.request_thread_id}:turn:${manifest.request_turn_id}`
        && (manifest.validator_identity_source === 'codex_request_meta'
            || manifest.validator_identity_source === 'test_fixture')
        && requestRecordFieldsValid
        && nonempty(subject.repository_id)
        && nonempty(subject.bead_id)
        && subject.work_receipt_kind === 'forge_execution'
        && nonempty(subject.work_receipt_id)
        && nonempty(subject.forge_request_id)
        && VALIDATION_EVIDENCE_SHA256.test(subject.forge_request_sha256)
        && nonempty(subject.decision_id)
        && VALIDATION_EVIDENCE_SHA256.test(subject.target_paths_sha256)
        && nonempty(subject.attempt_id)
        && (subject.result_artifact_sha256 === null
            || VALIDATION_EVIDENCE_SHA256.test(subject.result_artifact_sha256))
        && nonempty(subject.adapter_ref)
        && nullableNonempty(subject.adapter_version)
        && nullableNonempty(subject.external_execution_id)
        && independence.policy === 'distinct_codex_root_thread_from_forge_requester_and_executor_v1'
        && independence.validator_thread_id === manifest.request_thread_id
        && nonempty(independence.requester_thread_id)
        && nonempty(independence.requester_turn_id)
        && VALIDATION_EVIDENCE_SHA256.test(independence.requester_record_set_sha256)
        && independence.executor_binding === 'forge_exact_authorizing_turn_v1'
        && nonempty(independence.authorization_id)
        && nonempty(independence.executor_thread_id)
        && nonempty(independence.executor_turn_id)
        && VALIDATION_EVIDENCE_SHA256.test(independence.executor_record_sha256)
        && VALIDATION_EVIDENCE_SHA256.test(independence.executor_record_set_sha256)
        && independence.executor_record_count === 1
        && manifest.request_thread_id !== independence.requester_thread_id
        && manifest.request_thread_id !== independence.executor_thread_id
        && Array.isArray(manifest.artifacts)
        && manifest.artifacts.length > 0
        && manifest.artifacts.length <= 50
        && manifest.artifacts.every((entry) => (
            isRecord(entry)
            && nonempty(entry.path)
            && nonempty(entry.sha256)
            && VALIDATION_EVIDENCE_SHA256.test(entry.sha256)
        ))
        && Array.isArray(manifest.checks)
        && manifest.checks.length > 0
        && manifest.checks.length <= 25
        && manifest.checks.every((check) => (
            isRecord(check)
            && nonempty(check.name)
            && check.status === 'pass'
            && nonempty(check.evidence_path)
            && nonempty(check.sha256)
            && VALIDATION_EVIDENCE_SHA256.test(check.sha256)
        ));
}
