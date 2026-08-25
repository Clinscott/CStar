import path from 'node:path';
import type { HallForgeRequestRecord } from '../../../types/forge.js';
import {
    FORGE_NATIVE_CAPABILITIES,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_GENERATION,
    FORGE_NATIVE_REQUEST_SCHEMA,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    intersectNativeAuthority,
    isCanonicalAbsolutePath,
    stableNativeJson,
    type ForgeNativeAuthorityScope,
    type ForgeNativeRequest,
} from '../../../types/forge_native_swarm.js';
import { buildForgeRequestId, hashCanonicalForgeRequest, hashForgeTargetPaths, type CanonicalForgeRequest } from './forge_request_contract.js';

export type ForgeNativeRequestBinding = {
    request: ForgeNativeRequest;
    effective_scope: ForgeNativeAuthorityScope;
    scope_sha256: string;
    evidence_root: string;
    binding_sha256: string;
};
export type ForgeNativeRequestBindingInput = {
    request: HallForgeRequestRecord;
    canonical: CanonicalForgeRequest;
    code_root: string;
    control_root: string;
    durable_scope?: ForgeNativeAuthorityScope;
    connection_policy?: ForgeNativeAuthorityScope;
    lease_scope?: ForgeNativeAuthorityScope;
    now?: number;
};
const FORBIDDEN_CALLER_FIELDS = new Set([
    'native_request', 'native_authority', 'native_scope', 'native_evidence_root', 'evidence_root', 'native_identity',
    'actual_identity', 'actual_identity_attested', 'cancellation_secret', 'cancellation_secret_sha256', 'lease_id',
    'run_id', 'connection_generation', 'native_generation', 'native_cancel', 'native_cancellation',
]);
export function rejectNativeCallerAuthority(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of Object.keys(value as Record<string, unknown>)) {
        if (FORBIDDEN_CALLER_FIELDS.has(key) && (value as Record<string, unknown>)[key] !== undefined) {
            throw new ForgeNativeError(`forge_native_caller_field_forbidden:${key}`);
        }
    }
}
export function isNativeForgeRequest(canonical: Pick<CanonicalForgeRequest, 'adapter_ref'>): boolean {
    return canonical.adapter_ref === FORGE_NATIVE_CONNECTION_ID;
}
function assertRoot(value: string, code: string): string {
    if (!isCanonicalAbsolutePath(value)) throw new ForgeNativeError(code);
    return value;
}
function canonicalRequestIntegrity(record: HallForgeRequestRecord, canonical: CanonicalForgeRequest): void {
    if (!isNativeForgeRequest(canonical)) throw new ForgeNativeError('forge_native_connection_not_selected');
    if (hashCanonicalForgeRequest(canonical) !== record.request_sha256
        || buildForgeRequestId(record.request_sha256) !== record.request_id
        || hashForgeTargetPaths(canonical) !== record.target_paths_sha256
        || stableNativeJson(canonical) !== stableNativeJson(JSON.parse(record.request_summary_json))) {
        throw new ForgeNativeError('forge_native_request_integrity_invalid');
    }
}
function defaultScope(input: ForgeNativeRequestBindingInput): ForgeNativeAuthorityScope {
    const sourceRepository = assertRoot(input.code_root, 'forge_native_source_repository_invalid');
    const executionRoot = assertRoot(input.control_root, 'forge_native_execution_root_invalid');
    const write = [...new Set(input.canonical.required_output_paths.length ? input.canonical.required_output_paths : input.canonical.target_paths)].sort();
    const test = [...new Set(input.canonical.target_paths)].sort();
    const read = [...new Set([...input.canonical.target_paths, ...input.canonical.required_output_paths])].sort();
    if (!write.length || !test.length || !read.length) throw new ForgeNativeError('forge_native_request_scope_empty');
    return {
        decision_id: input.request.decision_id, set_batch_id: input.request.decision_id,
        connection_id: FORGE_NATIVE_CONNECTION_ID, generation: FORGE_NATIVE_GENERATION,
        request_id: input.request.request_id, request_sha256: input.request.request_sha256,
        source_repository: sourceRepository, source_head: input.request.request_sha256, execution_root: executionRoot,
        read_allowlist: read, write_allowlist: write, test_allowlist: test, quarantine_allowlist: [executionRoot],
        effect_exclusions: ['network', 'provider', 'git', 'install', 'activation', 'restart', 'deployment', 'production', 'secrets', 'wd', 'permanent_deletion'],
        model_policy_sha256: hashNative({ connection_id: FORGE_NATIVE_CONNECTION_ID, model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING }),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    };
}
function requestScope(base: ForgeNativeAuthorityScope, input: ForgeNativeRequestBindingInput): ForgeNativeAuthorityScope {
    const read = [...new Set([...input.canonical.target_paths, ...input.canonical.required_output_paths])].sort();
    const write = [...new Set(input.canonical.required_output_paths.length ? input.canonical.required_output_paths : input.canonical.target_paths)].sort();
    const test = [...new Set(input.canonical.target_paths)].sort();
    return { ...base, request_id: input.request.request_id, request_sha256: input.request.request_sha256, read_allowlist: read, write_allowlist: write, test_allowlist: test };
}
export function deriveNativeEvidenceRoot(controlRoot: string, requestId: string): string {
    assertRoot(controlRoot, 'forge_native_control_root_invalid');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(requestId)) throw new ForgeNativeError('forge_native_request_id_invalid');
    return path.join(controlRoot, 'work', 'forge-native', requestId);
}
export function bindForgeNativeRequest(input: ForgeNativeRequestBindingInput): ForgeNativeRequestBinding {
    rejectNativeCallerAuthority(input.canonical);
    canonicalRequestIntegrity(input.request, input.canonical);
    const base = input.durable_scope ?? defaultScope(input);
    if (base.request_id !== input.request.request_id || base.request_sha256 !== input.request.request_sha256) {
        throw new ForgeNativeError('forge_native_durable_request_mismatch');
    }
    const immutable = requestScope(base, input);
    const policy = input.connection_policy ?? base;
    const lease = input.lease_scope ?? base;
    const authority = intersectNativeAuthority({ durable_set: base, immutable_request: immutable, connection_policy: policy, run_lease: lease });
    const evidenceRoot = deriveNativeEvidenceRoot(input.control_root, input.request.request_id);
    const deadline = input.now ?? Date.now();
    const nativeRequestBase: ForgeNativeRequest = {
        schema: FORGE_NATIVE_REQUEST_SCHEMA, authority: authority.effective_scope, goal: input.canonical.objective,
        acceptance: input.canonical.required_metrics.map((metric) => `${metric.name}: ${metric.threshold}`),
        source_identity: { repository: authority.effective_scope.source_repository, head: authority.effective_scope.source_head, execution_root: authority.effective_scope.execution_root },
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        capabilities: [...FORGE_NATIVE_CAPABILITIES], deadline_at: Math.max(deadline + 900_000, deadline + 1), idempotency_key: input.request.request_id,
        evidence_root: evidenceRoot,
    };
    const binding = hashNative({ ...nativeRequestBase, binding_sha256: '' });
    const nativeRequest = { ...nativeRequestBase, binding_sha256: binding };
    return { request: nativeRequest, effective_scope: authority.effective_scope, scope_sha256: authority.scope_sha256, evidence_root: evidenceRoot, binding_sha256: binding };
}
export function verifyForgeNativeRequestBinding(binding: ForgeNativeRequestBinding): void {
    if (binding.request.schema !== FORGE_NATIVE_REQUEST_SCHEMA || binding.request.authority.connection_id !== FORGE_NATIVE_CONNECTION_ID) throw new ForgeNativeError('forge_native_request_binding_invalid');
    const expected = hashNative({ ...binding.request, binding_sha256: '' });
    if (binding.binding_sha256 !== expected || binding.request.binding_sha256 !== expected) throw new ForgeNativeError('forge_native_request_binding_digest_mismatch');
    if (binding.scope_sha256 !== hashNative(binding.effective_scope)) throw new ForgeNativeError('forge_native_scope_digest_mismatch');
}
