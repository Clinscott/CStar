import type { HallForgeRequestRecord } from '../../../types/forge.js';
import {
    FORGE_NATIVE_CAPABILITIES,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    isCanonicalAbsolutePath,
    stableNativeJson,
    type ForgeNativeRequest,
} from '../../../types/forge_native_swarm.js';
import { forgeNativeRequestSchema } from '../contracts/forge_native_swarm.js';
import {
    deriveNativeAuthorizationId,
    deriveNativeAuthority,
    deriveNativeEvidenceRoot,
    deriveNativeRequestId,
    type NativeAuthorityContext,
} from '../../../tools/pennyone/intel/forge_native_swarm_authority.js';
import { hashCanonicalForgeRequest, hashForgeTargetPaths, type CanonicalForgeRequest } from './forge_request_contract.js';

export type NativeRequestRecord = Pick<HallForgeRequestRecord,
    'request_id' | 'request_sha256' | 'bead_id' | 'decision_id' | 'request_summary_json'
    | 'target_paths_sha256' | 'adapter_ref' | 'write_capability'> & Partial<HallForgeRequestRecord>;

export type ForgeNativeRequestBinding = {
    request: ForgeNativeRequest;
    request_id: string;
    request_sha256: string;
    evidence_root: string;
    effective_scope: ForgeNativeRequest['authority'];
    scope_sha256: string;
    authority: ReturnType<typeof deriveNativeAuthority>;
    code_root: string;
    control_root: string;
};

const FORBIDDEN_CALLER_FIELDS = new Set([
    'actual_identity', 'actual_identity_attested', 'authority', 'cancellation_secret', 'connection_policy',
    'durable_set', 'evidence_root', 'generation', 'identity_attestation', 'native_authorization',
    'native_binding_sha256', 'native_capabilities', 'native_deadline_at', 'native_evidence_root',
    'native_generation', 'native_idempotency_key', 'native_request', 'native_request_id', 'native_scope',
    'request_authority', 'run_lease', 'scope_sha256', 'set_authority',
]);

/** Reject authority-shaped caller material before the durable Forge mutation. */
export function rejectNativeCallerAuthority(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const key of Object.keys(value as Record<string, unknown>)) {
        if (FORBIDDEN_CALLER_FIELDS.has(key) || key.startsWith('native_')) {
            throw new ForgeNativeError('forge_native_caller_field_forbidden');
        }
    }
}

function assertRequestRecord(request: NativeRequestRecord): void {
    if (!request.request_id?.trim() || !/^[a-f0-9]{64}$/.test(request.request_sha256)) {
        throw new ForgeNativeError('forge_native_request_record_invalid');
    }
    if (request.adapter_ref !== undefined && request.adapter_ref !== FORGE_NATIVE_CONNECTION_ID) {
        throw new ForgeNativeError('forge_native_connection_mismatch');
    }
}

function deterministicAcceptance(canonical: CanonicalForgeRequest): string[] {
    const metrics = canonical.required_metrics.map((metric) => JSON.stringify({
        acceptance_rule: metric.acceptance_rule,
        name: metric.name,
        threshold: metric.threshold,
        unit: metric.unit,
    }));
    return [...new Set([...metrics, ...canonical.artifact_expectations])].sort();
}

function assertCanonicalRequest(request: NativeRequestRecord, canonical: CanonicalForgeRequest): void {
    if (hashCanonicalForgeRequest(canonical) !== request.request_sha256) {
        throw new ForgeNativeError('forge_native_request_canonical_hash_mismatch');
    }
    if (request.target_paths_sha256 && hashForgeTargetPaths(canonical) !== request.target_paths_sha256) {
        throw new ForgeNativeError('forge_native_request_target_hash_mismatch');
    }
    if (canonical.adapter_ref !== null && canonical.adapter_ref !== FORGE_NATIVE_CONNECTION_ID) {
        throw new ForgeNativeError('forge_native_connection_mismatch');
    }
}

function context(input: {
    request: NativeRequestRecord;
    canonical: CanonicalForgeRequest;
    code_root: string;
    control_root: string;
    authority?: NativeAuthorityContext['authority'];
}): NativeAuthorityContext {
    return {
        canonical: input.canonical,
        request_id: input.request.request_id,
        request_sha256: input.request.request_sha256,
        code_root: input.code_root,
        control_root: input.control_root,
        authority: input.authority,
    };
}

export function bindForgeNativeRequest(input: {
    request: NativeRequestRecord;
    canonical: CanonicalForgeRequest;
    code_root: string;
    control_root: string;
    authority?: NativeAuthorityContext['authority'];
    caller?: unknown;
}): ForgeNativeRequestBinding {
    rejectNativeCallerAuthority(input.caller);
    assertRequestRecord(input.request);
    assertCanonicalRequest(input.request, input.canonical);
    if (!isCanonicalAbsolutePath(input.code_root) || !isCanonicalAbsolutePath(input.control_root)) {
        throw new ForgeNativeError('forge_native_binding_root_invalid');
    }
    const authority = deriveNativeAuthority(context(input));
    const evidenceRoot = deriveNativeEvidenceRoot(input.control_root, input.request.request_id);
    const request: ForgeNativeRequest = {
        schema: 'cstar.forge_native_swarm_request.v1',
        authority: authority.effective_scope,
        goal: input.canonical.objective,
        acceptance: deterministicAcceptance(input.canonical),
        source_identity: {
            repository: authority.effective_scope.source_repository,
            head: authority.effective_scope.source_head,
            execution_root: authority.effective_scope.execution_root,
        },
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        capabilities: [...FORGE_NATIVE_CAPABILITIES],
        deadline_at: 4_102_444_800_000,
        idempotency_key: deriveNativeRequestId(input.request.request_id),
        evidence_root: evidenceRoot,
        binding_sha256: '',
    };
    request.binding_sha256 = hashNative({ ...request, binding_sha256: '' });
    const binding: ForgeNativeRequestBinding = {
        request,
        request_id: input.request.request_id,
        request_sha256: input.request.request_sha256,
        evidence_root: evidenceRoot,
        effective_scope: authority.effective_scope,
        scope_sha256: authority.scope_sha256,
        authority,
        code_root: input.code_root,
        control_root: input.control_root,
    };
    verifyForgeNativeRequestBinding(binding);
    return binding;
}

export function verifyForgeNativeRequestBinding(binding: ForgeNativeRequestBinding): void {
    if (binding.request.schema !== 'cstar.forge_native_swarm_request.v1') {
        throw new ForgeNativeError('forge_native_request_schema_invalid');
    }
    forgeNativeRequestSchema.parse(binding.request);
    if (binding.request.authority.connection_id !== FORGE_NATIVE_CONNECTION_ID
        || binding.request.authority.request_id !== binding.request_id
        || binding.request.authority.request_sha256 !== binding.request_sha256) {
        throw new ForgeNativeError('forge_native_request_authority_mismatch');
    }
    if (binding.request.evidence_root !== binding.evidence_root
        || binding.evidence_root !== deriveNativeEvidenceRoot(binding.control_root, binding.request_id)) {
        throw new ForgeNativeError('forge_native_evidence_root_mismatch');
    }
    if (binding.request.binding_sha256 !== hashNative({ ...binding.request, binding_sha256: '' })) {
        throw new ForgeNativeError('forge_native_request_binding_digest_mismatch');
    }
    if (binding.scope_sha256 !== hashNative(binding.effective_scope)
        || stableNativeJson(binding.effective_scope) !== stableNativeJson(binding.request.authority)) {
        throw new ForgeNativeError('forge_native_request_scope_mismatch');
    }
    if (binding.request.requested_identity.model !== FORGE_NATIVE_REQUESTED_MODEL
        || binding.request.requested_identity.reasoning !== FORGE_NATIVE_REQUESTED_REASONING) {
        throw new ForgeNativeError('forge_native_requested_identity_policy_mismatch');
    }
}

export { deriveNativeEvidenceRoot, deriveNativeAuthorizationId };
